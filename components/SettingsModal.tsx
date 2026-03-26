
import React, { useState, useEffect } from 'react';
import { UserProfile, VoiceOutputSettings, VoiceInputSettings } from '../types';
import { SUPPORTED_INPUT_LANGUAGES, USE_ELEVENLABS_TTS } from '../constants';
import Modal from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: UserProfile;
  onSave: (newProfile: UserProfile) => void;
  availableVoices: { name: string, id: string }[];
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentProfile, onSave, availableVoices }) => {
  const [profile, setProfile] = useState<UserProfile>(currentProfile);

  useEffect(() => {
    // Update local state if the prop changes (e.g., when modal is reopened with fresh profile data)
    setProfile(currentProfile);
  }, [currentProfile, isOpen]);

  const handleOutputSettingChange = <K extends keyof VoiceOutputSettings>(
    key: K,
    value: VoiceOutputSettings[K]
  ) => {
    setProfile(prev => ({
      ...prev,
      voiceOutput: {
        ...prev.voiceOutput,
        [key]: value,
      },
    }));
  };

  const handleInputSettingChange = <K extends keyof VoiceInputSettings>(
    key: K,
    value: VoiceInputSettings[K]
  ) => {
    setProfile(prev => ({
      ...prev,
      voiceInput: {
        ...prev.voiceInput,
        [key]: value,
      },
    }));
  };

  const handleSave = () => {
    onSave(profile);
    onClose();
  };

  const renderSlider = (
    label: string,
    id: keyof VoiceOutputSettings,
    min: number,
    max: number,
    step: number,
    value: number,
    disabled: boolean = false
  ) => (
    <div className="mb-4">
      <label htmlFor={String(id)} className={`block text-sm font-medium mb-1 ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>
        {label}: <span className={disabled ? 'text-gray-500' : 'text-blue-400'}>{Number(value).toFixed(2)}</span>
      </label>
      <input
        type="range"
        id={String(id)}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleOutputSettingChange(id, parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50"
        disabled={disabled || (!profile.voiceOutput.enabled && id !== 'enabled')}
      />
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-6">
        <fieldset className="border border-gray-600 p-4 rounded-md">
          <legend className="text-lg font-semibold text-blue-400 px-2">Voice Feedback (AI Speech)</legend>
          <div className="mb-4 flex items-center">
            <input
              type="checkbox"
              id="voiceEnabled"
              checked={profile.voiceOutput.enabled}
              onChange={(e) => handleOutputSettingChange('enabled', e.target.checked)}
              className="h-5 w-5 text-blue-500 border-gray-500 rounded focus:ring-blue-400 bg-gray-700"
            />
            <label htmlFor="voiceEnabled" className="ml-2 text-gray-300">
              Enable AI Voice Feedback
            </label>
          </div>
          
          <div className="mb-4">
             <p className="text-xs text-gray-400 mb-2">
               {USE_ELEVENLABS_TTS
                 ? 'Note: Using high-quality ElevenLabs voices. Rate/Pitch adjustments are not supported.'
                 : 'Note: Using high-quality OpenAI TTS voices. Rate/Pitch adjustments are not supported by OpenAI TTS.'}
             </p>
          </div>

          {/* Rate and Pitch are not supported by OpenAI TTS endpoint, only volume works. */}
          {renderSlider('Volume', 'volume', 0, 1, 0.05, profile.voiceOutput.volume)}
          {renderSlider('Rate (Not supported by OpenAI)', 'rate', 0.5, 2, 0.1, profile.voiceOutput.rate, true)}
          {renderSlider('Pitch (Not supported by OpenAI)', 'pitch', 0, 2, 0.1, profile.voiceOutput.pitch, true)}


          <div className="mb-4">
            <label htmlFor="voiceURI" className="block text-sm font-medium text-gray-300 mb-1">
              AI Voice Persona
            </label>
            <select
              id="voiceURI"
              value={profile.voiceOutput.voiceURI || ''}
              onChange={(e) => handleOutputSettingChange('voiceURI', e.target.value || null)}
              className="w-full p-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              disabled={!profile.voiceOutput.enabled || availableVoices.length === 0}
            >
              {availableVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        
        <fieldset className="border border-gray-600 p-4 rounded-md">
          <legend className="text-lg font-semibold text-blue-400 px-2">Voice Input (Your Speech)</legend>
          <div className="mb-4">
            <label htmlFor="inputLanguage" className="block text-sm font-medium text-gray-300 mb-1">
              Input Language
            </label>
            <select
              id="inputLanguage"
              value={profile.voiceInput.language}
              onChange={(e) => handleInputSettingChange('language', e.target.value)}
              className="w-full p-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              {SUPPORTED_INPUT_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
