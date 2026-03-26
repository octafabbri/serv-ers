import React from 'react';
import { SettingsPage } from '../SettingsPage';

interface ProviderSettingsProps {
  isDark: boolean;
  onSwitchRole: () => void;
  currentVoice?: string;
  currentLanguage?: string;
  onSave?: (settings: { voicePersona: string; language: string }) => void;
}

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({
  isDark,
  onSwitchRole,
  currentVoice,
  currentLanguage,
  onSave,
}) => {
  return (
    <SettingsPage
      isDark={isDark}
      currentVoice={currentVoice}
      currentLanguage={currentLanguage}
      onSave={onSave}
      onSwitchRole={onSwitchRole}
    />
  );
};
