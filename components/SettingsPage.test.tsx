import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('should render with default voice and language', () => {
    render(<SettingsPage isDark={false} />);

    // Check that voice and language sections are present
    expect(screen.getByText('Voice Persona')).toBeInTheDocument();
    expect(screen.getByText('Input Language')).toBeInTheDocument();
  });

  it('should initialize with provided current values', () => {
    render(
      <SettingsPage
        isDark={false}
        currentVoice="nova"
        currentLanguage="es-ES"
      />
    );

    const voiceSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const languageSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;

    expect(voiceSelect.value).toBe('nova');
    expect(languageSelect.value).toBe('es-ES');
  });

  it('should call onSave with updated settings', () => {
    const onSave = vi.fn();
    render(
      <SettingsPage
        isDark={false}
        currentVoice="onyx"
        currentLanguage="en-US"
        onSave={onSave}
      />
    );

    // Change voice
    const voiceSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(voiceSelect, { target: { value: 'shimmer' } });

    // Click save
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith({
      voicePersona: 'shimmer',
      language: 'en-US',
    });
  });

  it('should call onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <SettingsPage
        isDark={false}
        currentVoice="onyx"
        currentLanguage="en-US"
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
  });

  it('should revert changes when cancel is clicked', () => {
    render(
      <SettingsPage
        isDark={false}
        currentVoice="onyx"
        currentLanguage="en-US"
      />
    );

    const voiceSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;

    // Change voice
    fireEvent.change(voiceSelect, { target: { value: 'nova' } });
    expect(voiceSelect.value).toBe('nova');

    // Cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Should revert to original
    expect(voiceSelect.value).toBe('onyx');
  });

  it('should show all available OpenAI voices', () => {
    render(<SettingsPage isDark={false} />);

    const voiceSelect = screen.getAllByRole('combobox')[0];
    const options = voiceSelect.querySelectorAll('option');

    // Check that common OpenAI voices are present
    const voiceNames = Array.from(options).map((opt) => opt.value);
    expect(voiceNames).toContain('alloy');
    expect(voiceNames).toContain('echo');
    expect(voiceNames).toContain('fable');
    expect(voiceNames).toContain('onyx');
    expect(voiceNames).toContain('nova');
    expect(voiceNames).toContain('shimmer');
  });

  it('should disable save button when no changes are made', () => {
    render(
      <SettingsPage
        isDark={false}
        currentVoice="onyx"
        currentLanguage="en-US"
      />
    );

    const saveButton = screen.getByText('Save Changes') as HTMLButtonElement;

    // Initially disabled (no changes)
    expect(saveButton.disabled).toBe(true);
  });

  it('should enable save button when changes are made', () => {
    render(
      <SettingsPage
        isDark={false}
        currentVoice="onyx"
        currentLanguage="en-US"
      />
    );

    const voiceSelect = screen.getAllByRole('combobox')[0];
    const saveButton = screen.getByText('Save Changes') as HTMLButtonElement;

    // Make a change
    fireEvent.change(voiceSelect, { target: { value: 'nova' } });

    // Save button should be enabled
    expect(saveButton.disabled).toBe(false);
  });
});