import React, { createContext, useContext, useState } from 'react';
import { getAdvancedHandsFree, saveAdvancedHandsFree } from '../services/storageService';
import { KEYS } from '../services/storageKeys';

/**
 * "Advanced / hands-free lab" — off by default.
 * Only when enabled can quiz UI show nose/hand camera controls.
 */
interface ExperimentalSettingsContextType {
  isExperimentalEnabled: boolean;
  toggleExperimental: () => void;
  setExperimental: (v: boolean) => void;
}

const ExperimentalSettingsContext = createContext<ExperimentalSettingsContextType | null>(null);

export const useExperimentalSettings = () => {
  const context = useContext(ExperimentalSettingsContext);
  if (!context) {
    throw new Error('useExperimentalSettings must be used within an ExperimentalSettingsProvider');
  }
  return context;
};

export const ExperimentalSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isExperimentalEnabled, setIsExperimentalEnabled] = useState(() => {
    try {
      return getAdvancedHandsFree();
    } catch {
      return localStorage.getItem(KEYS.advancedHandsFree) === 'true' ||
        localStorage.getItem('experimental_features_enabled') === 'true';
    }
  });

  const setExperimental = (newValue: boolean) => {
    setIsExperimentalEnabled(newValue);
    saveAdvancedHandsFree(newValue).catch(() => {
      localStorage.setItem(KEYS.advancedHandsFree, String(newValue));
      localStorage.setItem('experimental_features_enabled', String(newValue));
    });
  };

  const toggleExperimental = () => setExperimental(!isExperimentalEnabled);

  return (
    <ExperimentalSettingsContext.Provider value={{ isExperimentalEnabled, toggleExperimental, setExperimental }}>
      {children}
    </ExperimentalSettingsContext.Provider>
  );
};
