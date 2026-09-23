import { useCallback, useEffect, useRef, useState } from "react";

import type { AppSettings, LexiGroup } from "@/types";
import { announceDataChanged } from "@/utils/dataEvents";
import * as storage from "@/utils/storage";

const GROUPS_UPDATED_EVENT = "lexi:groups-updated";

export function useGroups() {
  const [groups, setGroups] = useState<LexiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The Others group stays in storage while its setting is off, so saves that
  // write the whole list have to carry it along even though it isn't shown.
  const hiddenGroupsRef = useRef<LexiGroup[]>([]);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await storage.getSettings();
      if (settings.othersGroupEnabled) {
        await storage.ensureOthersGroup();
      }
      const loaded = await storage.getGroups();
      const others = loaded.filter((group) => group.isOthers);
      const regular = loaded.filter((group) => !group.isOthers);
      hiddenGroupsRef.current = settings.othersGroupEnabled ? [] : others;
      setGroups(settings.othersGroupEnabled ? [...regular, ...others] : regular);
      setError(null);
    } catch (err) {
      setError("Failed to load groups");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const onGroupsUpdated = () => {
      void loadGroups();
    };
    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppSettings>>).detail;
      if (typeof detail?.othersGroupEnabled === "boolean") void loadGroups();
    };

    window.addEventListener(GROUPS_UPDATED_EVENT, onGroupsUpdated);
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => {
      window.removeEventListener(GROUPS_UPDATED_EVENT, onGroupsUpdated);
      window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
    };
  }, [loadGroups]);

  const emitGroupsUpdated = () => {
    window.dispatchEvent(new CustomEvent(GROUPS_UPDATED_EVENT));
  };

  const addGroup = useCallback(async (group: Omit<LexiGroup, "id" | "dateAdded">) => {
    const trimmedName = group.name.trim();
    if (!trimmedName) {
      throw new Error("Group name is required");
    }

    const exists = groups.some((entry) => entry.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      throw new Error("Group already exists");
    }

    const nextGroup: LexiGroup = {
      id: crypto.randomUUID(),
      dateAdded: Date.now(),
      name: trimmedName,
      iconName: group.iconName || "Folder",
      description: group.description?.trim() || undefined,
    };

    await storage.addGroup(nextGroup);
    // New groups go before Others, which always stays last.
    setGroups((prev) => [...prev.filter((entry) => !entry.isOthers), nextGroup, ...prev.filter((entry) => entry.isOthers)]);
    emitGroupsUpdated();
    return nextGroup;
  }, [groups]);

  const updateGroup = useCallback(async (id: string, updates: Partial<LexiGroup>) => {
    await storage.updateGroup(id, {
      ...updates,
      name: updates.name?.trim(),
      iconName: updates.iconName,
      description: updates.description?.trim() || undefined,
    });
    setGroups((prev) => prev.map((group) => (group.id === id ? { ...group, ...updates } : group)));
    emitGroupsUpdated();
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    if (groups.some((group) => group.id === id && group.isOthers)) {
      throw new Error("Others is built in. Turn it off in Settings instead.");
    }
    await storage.deleteGroup(id);
    setGroups((prev) => prev.filter((group) => group.id !== id));
    emitGroupsUpdated();
    // Deleting a group also strips it from every word and translation.
    announceDataChanged("words");
    announceDataChanged("translations");
  }, [groups]);

  const moveGroup = useCallback(async (id: string, direction: "up" | "down") => {
    const index = groups.findIndex((group) => group.id === id);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }
    if (groups[index].isOthers || groups[targetIndex].isOthers) {
      return;
    }

    const next = [...groups];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    await storage.saveGroups([...next, ...hiddenGroupsRef.current]);
    setGroups(next);
    emitGroupsUpdated();
  }, [groups]);

  return {
    groups,
    loading,
    error,
    addGroup,
    updateGroup,
    deleteGroup,
    moveGroup,
    refresh: loadGroups,
  };
}
