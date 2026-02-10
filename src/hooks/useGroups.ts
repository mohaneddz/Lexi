import { useCallback, useEffect, useState } from "react";

import type { LexiGroup } from "@/types";
import * as storage from "@/utils/storage";

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
      description: group.description?.trim() || undefined,
    };

    await storage.addGroup(nextGroup);
    setGroups((prev) => [...prev, nextGroup].sort((a, b) => a.name.localeCompare(b.name)));
    return nextGroup;
  }, [groups]);

  const updateGroup = useCallback(async (id: string, updates: Partial<LexiGroup>) => {
    await storage.updateGroup(id, {
      ...updates,
      name: updates.name?.trim(),
      description: updates.description?.trim() || undefined,
    });
    setGroups((prev) =>
      prev
        .map((group) => (group.id === id ? { ...group, ...updates } : group))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    await storage.deleteGroup(id);
    setGroups((prev) => prev.filter((group) => group.id !== id));
  }, []);

  return {
    groups,
    loading,
    error,
    addGroup,
    updateGroup,
    deleteGroup,
    refresh: loadGroups,
  };
}
