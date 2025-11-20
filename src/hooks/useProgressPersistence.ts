import { useCallback } from 'react';

interface ProgressData {
  sessionId: string;
  round: number;
  currentIndex: number;
  deck: string[]; // Place IDs
  timestamp: number;
}

/**
 * Hook for persisting swipe progress to sessionStorage
 * Uses format: ${sessionId}_progress as the storage key
 * sessionStorage automatically clears when the browser tab is closed
 */
export function useProgressPersistence(sessionId: string) {
  const storageKey = `${sessionId}_progress`;

  // Save progress
  const saveProgress = useCallback(
    (round: number, currentIndex: number, deckIds: string[]) => {
      const progress: ProgressData = {
        sessionId,
        round,
        currentIndex,
        deck: deckIds,
        timestamp: Date.now(),
      };
      
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(progress));
      } catch (error) {
        console.error('Failed to save progress to sessionStorage:', error);
        // Handle quota exceeded errors gracefully
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.warn('sessionStorage quota exceeded, clearing old progress');
          try {
            // Clear all old progress entries
            const keys = Object.keys(sessionStorage);
            keys.forEach((key) => {
              if (key.endsWith('_progress')) {
                sessionStorage.removeItem(key);
              }
            });
            // Retry saving
            sessionStorage.setItem(storageKey, JSON.stringify(progress));
          } catch (retryError) {
            console.error('Failed to retry saving progress:', retryError);
          }
        }
      }
    },
    [sessionId, storageKey]
  );

  // Load progress
  const loadProgress = useCallback((): ProgressData | null => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return null;

      const progress: ProgressData = JSON.parse(stored);

      // Verify it's for the same session
      if (progress.sessionId !== sessionId) {
        sessionStorage.removeItem(storageKey);
        return null;
      }

      return progress;
    } catch (error) {
      console.error('Failed to load progress from sessionStorage:', error);
      // Remove invalid data
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore errors when removing
      }
      return null;
    }
  }, [sessionId, storageKey]);

  // Clear progress
  const clearProgress = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to clear progress from sessionStorage:', error);
    }
  }, [storageKey]);

  return {
    saveProgress,
    loadProgress,
    clearProgress,
  };
}

