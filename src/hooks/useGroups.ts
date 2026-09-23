import { useCallback, useEffect, useState } from "react";

import type { LexiGroup } from "@/types";
import { announceDataChanged } from "@/utils/dataEvents";
import * as storage from "@/utils/storage";

const GROUPS_UPDATED_EVENT = "lexi:groups-updated";

export function useGroups() {
  const [groups, setGroups] = useState<LexiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await storage.getGroups();
      setGroups(loaded);
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

    window.addEventListener(GROUPS_UPDATED_EVENT, onGroupsUpdated);
    return () => window.removeEventListener(GROUPS_UPDATED_EVENT, onGroupsUpdated);
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
    setGroups((prev) => [...prev, nextGroup]);
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
    await storage.deleteGroup(id);
    setGroups((prev) => prev.filter((group) => group.id !== id));
    emitGroupsUpdated();
    // Deleting a group also strips it from every word and translation.
    announceDataChanged("words");
    announceDataChanged("translations");
  }, []);

  const moveGroup = useCallback(async (id: string, direction: "up" | "down") => {
    const index = groups.findIndex((group) => group.id === id);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }

    const next = [...groups];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    await storage.saveGroups(next);
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
