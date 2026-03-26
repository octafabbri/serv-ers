import React, { useState } from 'react';
import { ServiceRequest } from '../../types';
import { BottomMenuBar } from '../BottomMenuBar';
import { ProviderDashboard } from './ProviderDashboard';
import { WorkOrderDetail } from './WorkOrderDetail';
import { CounterProposalForm } from './CounterProposalForm';
import { DeclineReasonForm } from './DeclineReasonForm';
import { ActiveJobs } from './ActiveJobs';
import { ProviderSettings } from './ProviderSettings';
import { ProviderVoiceAssistant } from './ProviderVoiceAssistant';

const PROVIDER_SETTINGS_KEY = 'provider_voice_settings';

interface ProviderVoiceSettings {
  voiceURI: string;
  language: string;
}

function loadProviderSettings(): ProviderVoiceSettings {
  try {
    const stored = localStorage.getItem(PROVIDER_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { voiceURI: 'onyx', language: 'en-US' };
}

function saveProviderSettings(settings: ProviderVoiceSettings): void {
  try {
    localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationToast } from '../NotificationToast';
import {
  isSupabaseConfigured,
  acceptServiceRequest,
  approveProposedTime,
  rejectServiceRequest,
  proposeNewTime,
  completeServiceRequest,
} from '../../services/supabaseService';

type ProviderTab = 'dashboard' | 'active' | 'assistant' | 'settings';
type ProviderView = 'list' | 'detail' | 'counter-propose' | 'decline';

interface ProviderAppProps {
  onSwitchRole: () => void;
}

export const ProviderApp: React.FC<ProviderAppProps> = ({ onSwitchRole }) => {
  const [currentTab, setCurrentTab] = useState<ProviderTab>('assistant');
  const [currentView, setCurrentView] = useState<ProviderView>('list');
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderVoiceSettings>(loadProviderSettings);
  const isDark = false; // Match fleet: always light mode
  const { userId } = useSupabaseAuth();
  const { activeToast, dismissToast, unreadCount } = useNotifications(userId, 'provider');

  const handleSelectRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setCurrentView('detail');
  };

  const handleBack = () => {
    setCurrentView('list');
    setSelectedRequest(null);
  };

  const handleAccept = async (request: ServiceRequest) => {
    if (!isSupabaseConfigured() || !userId) return;

    try {
      if (request.status === 'counter_proposed') {
        await approveProposedTime(request.id);
      } else {
        await acceptServiceRequest(request.id, userId, 'Provider');
      }
      handleBack();
    } catch (err) {
      console.error('Failed to accept request:', err);
    }
  };

  const handleReject = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setCurrentView('decline');
  };

  const handleConfirmDecline = async (reason: string) => {
    if (!isSupabaseConfigured() || !selectedRequest) return;

    try {
      await rejectServiceRequest(selectedRequest.id, reason || undefined);
      handleBack();
    } catch (err) {
      console.error('Failed to decline request:', err);
    }
  };

  const handleComplete = async (request: ServiceRequest) => {
    if (!isSupabaseConfigured()) return;
    try {
      await completeServiceRequest(request.id);
      handleBack();
    } catch (err) {
      console.error('Failed to complete request:', err);
    }
  };

  const handleCounterPropose = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setCurrentView('counter-propose');
  };

  const handleSubmitCounterProposal = async (data: {
    proposed_datetime: string;
    notes: string;
  }) => {
    if (!isSupabaseConfigured() || !selectedRequest) return;

    try {
      await proposeNewTime(
        selectedRequest.id,
        data.proposed_datetime,
        data.notes || undefined
      );
      handleBack();
    } catch (err) {
      console.error('Failed to submit counter-proposal:', err);
    }
  };

  // Voice-assistant-specific handlers (no navigation side-effects)
  const handleVoiceAccept = async (request: ServiceRequest) => {
    if (!isSupabaseConfigured() || !userId) return;
    if (request.status === 'counter_proposed') {
      await approveProposedTime(request.id);
    } else {
      await acceptServiceRequest(request.id, userId, 'Provider');
    }
  };

  const handleVoiceReject = async (requestId: string, reason: string) => {
    if (!isSupabaseConfigured()) return;
    await rejectServiceRequest(requestId, reason || undefined);
  };

  const handleVoiceCounter = async (
    requestId: string,
    data: { proposed_datetime: string; notes: string }
  ) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    await proposeNewTime(requestId, data.proposed_datetime, data.notes || undefined);
  };

  const handleSaveSettings = (settings: { voicePersona: string; language: string }) => {
    const updated = { voiceURI: settings.voicePersona, language: settings.language };
    setProviderSettings(updated);
    saveProviderSettings(updated);
  };

  const handleNavigate = (tab: string) => {
    setCurrentTab(tab as ProviderTab);
    setCurrentView('list');
    setSelectedRequest(null);
  };

  const renderContent = () => {
    // Detail / counter-propose views (overlay on any tab)
    if (currentView === 'detail' && selectedRequest) {
      return (
        <WorkOrderDetail
          request={selectedRequest}
          isDark={isDark}
          onBack={handleBack}
          onAccept={handleAccept}
          onReject={handleReject}
          onCounterPropose={handleCounterPropose}
          onComplete={handleComplete}
        />
      );
    }

    if (currentView === 'counter-propose' && selectedRequest) {
      return (
        <CounterProposalForm
          request={selectedRequest}
          isDark={isDark}
          onBack={() => setCurrentView('detail')}
          onSubmit={handleSubmitCounterProposal}
        />
      );
    }

    if (currentView === 'decline' && selectedRequest) {
      return (
        <DeclineReasonForm
          request={selectedRequest}
          isDark={isDark}
          onBack={() => setCurrentView('detail')}
          onSubmit={handleConfirmDecline}
        />
      );
    }

    // Tab views
    switch (currentTab) {
      case 'dashboard':
        return (
          <ProviderDashboard
            isDark={isDark}
            providerId={userId || ''}
            onSelectRequest={handleSelectRequest}
          />
        );
      case 'active':
        return (
          <ActiveJobs
            isDark={isDark}
            providerId={userId || ''}
            onSelectRequest={handleSelectRequest}
          />
        );
      case 'assistant':
        return (
          <ProviderVoiceAssistant
            isDark={isDark}
            userId={userId}
            voiceName={providerSettings.voiceURI}
            language={providerSettings.language}
            onAccept={handleVoiceAccept}
            onReject={handleVoiceReject}
            onCounter={handleVoiceCounter}
          />
        );
      case 'settings':
        return (
          <ProviderSettings
            isDark={isDark}
            onSwitchRole={onSwitchRole}
            currentVoice={providerSettings.voiceURI}
            currentLanguage={providerSettings.language}
            onSave={handleSaveSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {activeToast && (
        <NotificationToast
          toast={activeToast}
          isDark={isDark}
          onDismiss={dismissToast}
        />
      )}
      {renderContent()}
      <BottomMenuBar
        isDark={isDark}
        role="provider"
        onNavigate={handleNavigate}
        activeTab={currentTab}
        badgeCount={unreadCount}
      />
    </>
  );
};
