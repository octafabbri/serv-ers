import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AssistantTask, ActiveModalInfo, ParkingSpot, UserProfile, MoodEntry, ServiceRequest } from '../../types';
import Modal from '../Modal';
import SettingsModal from '../SettingsModal';
import { IdleState } from '../voice-ui/IdleState';
import { ListeningState } from '../voice-ui/ListeningState';
import { ProcessingState } from '../voice-ui/ProcessingState';
import { RespondingState } from '../voice-ui/RespondingState';
import { UrgentResponseState } from '../voice-ui/UrgentResponseState';
import { ResolutionState } from '../voice-ui/ResolutionState';
import { PDFGeneratingState } from '../voice-ui/PDFGeneratingState';
import { PDFReadyState } from '../voice-ui/PDFReadyState';
import { BottomMenuBar } from '../BottomMenuBar';
import { SettingsPage } from '../SettingsPage';
import { InputModeToggle } from '../InputModeToggle';
import { ChatInterface, ChatMessage } from '../ChatInterface';
import { getSpeechRecognition, playAudioContent, stopAudioPlayback, initializeAudio, SpeechRecognition, SpeechRecognitionEvent } from '../../services/speechService';
import { determineTaskFromInput, createNewChatWithTask, extractNameWithAI, generateSpeech, extractServiceDataFromConversation, ChatSession } from '../../services/aiService';
import { API_KEY_ERROR_MESSAGE, WELLNESS_CHECKIN_KEYWORDS, WELLNESS_CHECKIN_QUESTIONS, OPENAI_VOICES, ELEVENLABS_VOICES, USE_ELEVENLABS_TTS, SERVICE_REQUEST_KEYWORDS, FEATURE_FLAGS } from '../../constants';
import { loadUserProfile, saveUserProfile, addMoodEntry } from '../../services/userProfileService';
import { createServiceRequest, validateServiceRequest, addServiceRequest } from '../../services/serviceRequestService';
import { generateServiceRequestPDF, downloadPDF } from '../../services/pdfService';
import { isSupabaseConfigured, submitServiceRequest as submitToSupabase } from '../../services/supabaseService';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { useServiceRequests } from '../../hooks/useServiceRequests';
import { NotificationBanner } from './NotificationBanner';
import { NotificationsView } from './NotificationsView';
import { CounterProposalReview } from './CounterProposalReview';
import { FleetCounterProposalForm } from './FleetCounterProposalForm';
import { RequestDetailModal } from './RequestDetailModal';
import { NotificationToast } from '../NotificationToast';
import { proposeNewTime, approveProposedTime, rejectProposedTime } from '../../services/supabaseService';
import { WorkOrderCoordinationAgent, parseNaturalDate, parseTimeString, extractDateTime } from '../../services/coordinationAgentService';

type AssistantState = 'idle' | 'listening' | 'processing' | 'responding' | 'urgent' | 'resolution' | 'pdf-generating' | 'pdf-ready';
type NavigationTab = 'home' | 'notifications' | 'settings';
type InputMode = 'voice' | 'chat';

interface FleetAppProps {
  onSwitchRole: () => void;
}

export const FleetApp: React.FC<FleetAppProps> = ({ onSwitchRole }) => {
  // Voice-First UI State
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [transcription, setTranscription] = useState('');
  const [isResponseComplete, setIsResponseComplete] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [inputMode, setInputMode] = useState<InputMode>('voice');

  // Core Assistant State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModalInfo | null>(null);

  // Chat Sessions
  const [generalChatSession, setGeneralChatSession] = useState<ChatSession | null>(null);
  const [vehicleInspectionSession, setVehicleInspectionSession] = useState<ChatSession | null>(null);

  // Assistant Lifecycle
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [isAskingName, setIsAskingName] = useState(false);

  // User Profile & Settings
  const [userProfile, setUserProfile] = useState<UserProfile>(loadUserProfile());
  const [availableVoices] = useState<{name: string, id: string}[]>(USE_ELEVENLABS_TTS ? ELEVENLABS_VOICES : OPENAI_VOICES);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Wellness Check-in
  const [isWellnessCheckinActive, setIsWellnessCheckinActive] = useState(false);
  const [wellnessCheckinStep, setWellnessCheckinStep] = useState(0);
  const [pendingMoodEntry, setPendingMoodEntry] = useState<Partial<MoodEntry> | null>(null);

  // Service Request State
  const [isServiceRequestActive, setIsServiceRequestActive] = useState(false);
  const [activeServiceRequest, setActiveServiceRequest] = useState<ServiceRequest | null>(null);
  const [serviceRequestSession, setServiceRequestSession] = useState<ChatSession | null>(null);
  const [completedServiceRequest, setCompletedServiceRequest] = useState<ServiceRequest | null>(null);
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const [isAwaitingWorkOrderPrompt, setIsAwaitingWorkOrderPrompt] = useState(false);
  const [isAwaitingSummaryPrompt, setIsAwaitingSummaryPrompt] = useState(false);

  // Chat History (shared between voice and chat modes)
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Offline Detection
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Supabase Auth — ensures anonymous session exists before submitting requests
  const { userId: supabaseUserId } = useSupabaseAuth();

  // Notifications & Work Order History
  const { notifications, unreadCount, refresh: refreshNotifications, markAllRead, activeToast, dismissToast } = useNotifications(supabaseUserId);
  const { requests: myRequests, isLoading: isLoadingRequests, refresh: refreshRequests } = useServiceRequests(supabaseUserId);
  const [reviewingRequest, setReviewingRequest] = useState<ServiceRequest | null>(null);
  const [counterProposingRequest, setCounterProposingRequest] = useState<ServiceRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<ServiceRequest | null>(null);

  // Voice-based counter-proposal review
  const [voiceReviewRequest, setVoiceReviewRequest] = useState<ServiceRequest | null>(null);
  const [awaitingVoiceCtx, setAwaitingVoiceCtx] = useState<'command' | 'counter-date' | 'counter-time' | 'counter-confirm' | 'decline-reason' | null>(null);
  const [voiceCounterDate, setVoiceCounterDate] = useState('');
  const [voiceCounterTime, setVoiceCounterTime] = useState('');

  // Refs
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const transcriptAccumulatorRef = useRef<string>('');
  const currentAIResponseRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const inputModeRef = useRef<InputMode>('voice');
  const assistantStartedRef = useRef(false);
  const toggleListenRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const voiceReviewRequestRef = useRef<ServiceRequest | null>(null);
  const awaitingVoiceCtxRef = useRef<'command' | 'counter-date' | 'counter-time' | 'counter-confirm' | 'decline-reason' | null>(null);
  const voiceCounterDateRef = useRef('');
  const voiceCounterTimeRef = useRef('');
  const myRequestsRef = useRef<ServiceRequest[]>([]);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Keep refs in sync for use inside async callbacks (avoids stale closures)
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);
  useEffect(() => { assistantStartedRef.current = assistantStarted; }, [assistantStarted]);
  useEffect(() => { voiceReviewRequestRef.current = voiceReviewRequest; }, [voiceReviewRequest]);
  useEffect(() => { awaitingVoiceCtxRef.current = awaitingVoiceCtx; }, [awaitingVoiceCtx]);
  useEffect(() => { voiceCounterDateRef.current = voiceCounterDate; }, [voiceCounterDate]);
  useEffect(() => { voiceCounterTimeRef.current = voiceCounterTime; }, [voiceCounterTime]);
  useEffect(() => { myRequestsRef.current = myRequests; }, [myRequests]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Map existing states to voice UI states
  useEffect(() => {
    if (!assistantStarted) {
      setAssistantState('idle');
      return;
    }

    if (completedServiceRequest) {
      setAssistantState('pdf-ready');
    } else if (isServiceRequestActive && activeServiceRequest?.urgency === 'ERS' && isSpeaking) {
      setAssistantState('urgent');
    } else if (isSpeaking) {
      setAssistantState('responding');
    } else if (isLoadingAI) {
      setAssistantState('processing');
    } else if (isListening) {
      setAssistantState('listening');
    } else {
      setAssistantState('idle');
    }
  }, [assistantStarted, isListening, isLoadingAI, isSpeaking, isServiceRequestActive, activeServiceRequest, completedServiceRequest]);

  // Handle speaking logic using OpenAI TTS — queued so concurrent calls play sequentially
  const speakAiResponse = useCallback((text: string) => {
    if (!userProfile.voiceOutput.enabled || !text) return;

    currentAIResponseRef.current = text;
    setTranscription(text);

    const task = async () => {
      setIsResponseComplete(false);
      setIsSpeaking(true);
      try {
        const voiceName = userProfile.voiceOutput.voiceURI || 'EXAVITQu4vr4xnSDxMaL';
        const base64Audio = await generateSpeech(text, voiceName);
        if (base64Audio) {
          await playAudioContent(base64Audio, userProfile.voiceOutput.volume);
        }
      } catch (e) {
        console.error("Error speaking AI response:", e);
      } finally {
        setIsSpeaking(false);
        setIsResponseComplete(true);
        // Auto-listen intentionally removed. AudioBufferSourceNode.onended fires
        // before the audio pipeline finishes rendering, so the mic would open while
        // speech is still audible. User taps the orb to speak instead.
      }
    };

    speechQueueRef.current = speechQueueRef.current.then(task);
  }, [userProfile.voiceOutput]);

  // Get time-appropriate greeting
  const getTimeBasedGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 22) return "Good evening";
    return "Hey there";
  }, []);

  // Add message to chat history
  const addMessage = useCallback((sender: 'user' | 'ai' | 'system', text: string, data?: any) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender,
      text,
      timestamp: new Date(),
      ...(data && { data }),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const handleStartAssistant = async () => {
    try {
      await initializeAudio();
    } catch (e) {
      console.warn("Audio init failed", e);
    }

    setAssistantStarted(true);
    assistantStartedRef.current = true;
    if (!import.meta.env.VITE_GROQ_API_KEY) {
      setApiKeyError(API_KEY_ERROR_MESSAGE);
      return;
    }

    const timeGreeting = getTimeBasedGreeting();
    const scopeNote = FEATURE_FLAGS.MULTI_POSITION_SERVICE_ENABLED
      ? ''
      : ' At this moment, I handle tire, wheel, and mudflap emergencies — one position per request.';
    const greeting = userProfile.userName
      ? `${timeGreeting}, ${userProfile.userName}! I'm Serv, your Fleet Services AI Assistant.${scopeNote} What do you need?`
      : `${timeGreeting}! I'm Serv, your Fleet Services AI Assistant.${scopeNote} What do you need?`;

    addMessage('ai', greeting);
    speakAiResponse(greeting);
  };

  const handleAiResponseDisplay = useCallback((text: string) => {
    addMessage('ai', text);
    speakAiResponse(text);
  }, [speakAiResponse, addMessage]);

  const startWellnessCheckin = useCallback(() => {
    setIsWellnessCheckinActive(true);
    setWellnessCheckinStep(0);
    setPendingMoodEntry({ timestamp: new Date() });
    const firstQuestion = WELLNESS_CHECKIN_QUESTIONS[0];
    const questionText = `${firstQuestion.questionText} ${firstQuestion.scale || ''}`;
    addMessage('ai', questionText);
    speakAiResponse(questionText);
  }, [speakAiResponse, addMessage]);

  const handleWellnessCheckinResponse = useCallback((responseText: string) => {
    if (!pendingMoodEntry || wellnessCheckinStep >= WELLNESS_CHECKIN_QUESTIONS.length) return;

    const currentQuestion = WELLNESS_CHECKIN_QUESTIONS[wellnessCheckinStep];
    let parsedValue: string | number | undefined = responseText;

    if (currentQuestion.key === 'mood_rating' || currentQuestion.key === 'stress_level') {
      const match = responseText.match(/\b([1-5])\b/);
      parsedValue = match ? parseInt(match[1], 10) : undefined;
    }

    setPendingMoodEntry(prev => ({ ...prev, [currentQuestion.key]: parsedValue }));

    const nextStep = wellnessCheckinStep + 1;
    if (nextStep < WELLNESS_CHECKIN_QUESTIONS.length) {
      setWellnessCheckinStep(nextStep);
      const nextQuestion = WELLNESS_CHECKIN_QUESTIONS[nextStep];
      const questionPrompt = `${nextQuestion.questionText} ${nextQuestion.scale || ''}`;
      addMessage('ai', questionPrompt);
      speakAiResponse(questionPrompt);
    } else {
      const finalEntry = { ...pendingMoodEntry, timestamp: pendingMoodEntry.timestamp || new Date() } as MoodEntry;
      const updatedProfile = addMoodEntry(userProfile, finalEntry);
      setUserProfile(updatedProfile);
      saveUserProfile(updatedProfile);

      const ackMsg = "Thanks for sharing. I've logged that for you. Stay safe out there.";
      addMessage('ai', ackMsg);
      speakAiResponse(ackMsg);
      setIsWellnessCheckinActive(false);
      setWellnessCheckinStep(0);
      setPendingMoodEntry(null);
    }
  }, [pendingMoodEntry, wellnessCheckinStep, userProfile, speakAiResponse, addMessage]);

  // Deep-merge extracted data into current request
  const mergeServiceRequestData = (current: ServiceRequest, extracted: Partial<ServiceRequest>): ServiceRequest => {
    return {
      ...current,
      ...extracted,
      location: { ...current.location, ...extracted.location },
      vehicle: { ...current.vehicle, ...extracted.vehicle },
      ...(extracted.tire_info || current.tire_info
        ? { tire_info: { ...current.tire_info, ...extracted.tire_info } as ServiceRequest['tire_info'] }
        : {}),
      ...(extracted.mechanical_info || current.mechanical_info
        ? { mechanical_info: { ...current.mechanical_info, ...extracted.mechanical_info } as ServiceRequest['mechanical_info'] }
        : {}),
      ...(extracted.scheduled_appointment || current.scheduled_appointment
        ? { scheduled_appointment: { ...current.scheduled_appointment, ...extracted.scheduled_appointment } as ServiceRequest['scheduled_appointment'] }
        : {}),
    };
  };

  const formatDateForSpeech = (dateStr: string): string => {
    // Parse YYYY-MM-DD format into a speech-friendly string
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const buildConfirmationSummary = (request: ServiceRequest): string => {
    const vehicleType = request.vehicle.vehicle_type?.toLowerCase() || 'vehicle';
    const urgencyText = request.urgency === 'ERS' ? 'emergency same-day' : request.urgency === 'DELAYED' ? 'next-day' : 'scheduled';

    let summary = `Alright, let me read this back to you. ` +
      `Driver name, ${request.driver_name}. ` +
      `Phone, ${request.contact_phone}. ` +
      `Fleet, ${request.fleet_name}. ` +
      `Location, ${request.location.current_location}. ` +
      `Vehicle type, ${vehicleType}. `;

    if (request.service_type === 'TIRE' && request.tire_info) {
      summary += `Service type, tire ${request.tire_info.requested_service?.toLowerCase() || 'service'}. ` +
        `Tire, ${request.tire_info.requested_tire}. ` +
        `Quantity, ${request.tire_info.number_of_tires}. ` +
        `Position, ${request.tire_info.tire_position}. `;
    } else if (request.service_type === 'MECHANICAL' && request.mechanical_info) {
      summary += `Service type, mechanical. ` +
        `Requested service, ${request.mechanical_info.requested_service}. ` +
        `Issue, ${request.mechanical_info.description}. `;
    }

    summary += `Priority, ${urgencyText}. `;

    if (request.urgency === 'SCHEDULED' && request.scheduled_appointment) {
      const dateDisplay = formatDateForSpeech(request.scheduled_appointment.scheduled_date);
      summary += `Scheduled for ${dateDisplay} at ${request.scheduled_appointment.scheduled_time}. `;
    }

    summary += `Say yes to submit, or tell me what needs to change.`;
    return summary;
  };

  const CONFIRMATION_KEYWORDS = ['yes', 'yeah', 'yep', 'yup', 'correct', 'right', 'good', 'looks good', 'confirm', "that's right", 'perfect', 'go ahead', 'send it', 'submit', 'ok', 'okay', 'sure'];

  const finalizeServiceRequest = useCallback(async (request: ServiceRequest) => {
    console.log('FINALIZING SERVICE REQUEST');
    request.status = 'submitted';

    // Save to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        await submitToSupabase(request);
      } catch (err) {
        console.error('Supabase submit failed, falling back to localStorage:', err);
      }
    }

    // Always save to localStorage as well
    const updatedProfile = addServiceRequest(userProfile, request);
    setUserProfile(updatedProfile);
    saveUserProfile(updatedProfile);
    setCompletedServiceRequest(request);

    const completionMsg = `Got it, your work order is ready to download.`;
    addMessage('ai', completionMsg, request);
    speakAiResponse(completionMsg);

    setIsServiceRequestActive(false);
    setActiveServiceRequest(null);
    setIsAwaitingConfirmation(false);
    setIsAwaitingSummaryPrompt(false);
  }, [userProfile, speakAiResponse, addMessage]);

  const startServiceRequest = useCallback(async (initialMessage: string) => {
    const newRequest = createServiceRequest();
    newRequest.driver_name = userProfile.userName || 'Driver';
    setIsServiceRequestActive(true);
    setIsAwaitingConfirmation(false);

    const session = createNewChatWithTask(
      AssistantTask.SERVICE_REQUEST,
      userProfile.voiceInput.language,
      userProfile.userName
    );
    setServiceRequestSession(session);

    setIsLoadingAI(true);
    try {
      const response = await session.sendMessage({ message: initialMessage });
      const aiText = response.text;

      const newExchange = `user: ${initialMessage}\nai: ${aiText}`;
      const extractedData = await extractServiceDataFromConversation(newExchange, newRequest);

      const updatedRequest = mergeServiceRequestData(newRequest, {
        ...extractedData,
        conversation_transcript: newExchange,
      });
      setActiveServiceRequest(updatedRequest);

      const validation = validateServiceRequest(updatedRequest);
      if (validation.isComplete) {
        if (FEATURE_FLAGS.SUMMARY_PROMPT_ENABLED) {
          // Original: ask if they want a recap first
          const prompt = "Want me to read back the details before submitting?";
          addMessage('ai', aiText);
          addMessage('ai', prompt);
          speakAiResponse(aiText);
          speakAiResponse(prompt);
          setIsAwaitingSummaryPrompt(true);
        } else {
          // Always show summary immediately
          const summary = buildConfirmationSummary(updatedRequest);
          addMessage('ai', aiText);
          addMessage('ai', summary);
          speakAiResponse(aiText);
          speakAiResponse(summary);
          setIsAwaitingConfirmation(true);
        }
      } else {
        addMessage('ai', aiText);
        speakAiResponse(aiText);
      }
    } catch (error) {
      console.error("Service request start error:", error);
      const errorMsg = "Error starting service request. Please try again.";
      addMessage('ai', errorMsg);
      speakAiResponse(errorMsg);
      setIsServiceRequestActive(false);
    } finally {
      setIsLoadingAI(false);
    }
  }, [userProfile, speakAiResponse, addMessage]);

  const handleServiceRequestResponse = useCallback(async (text: string) => {
    if (!serviceRequestSession || !activeServiceRequest) return;

    // Handle "want to hear the details?" response — only reachable when FEATURE_FLAGS.SUMMARY_PROMPT_ENABLED is true
    if (isAwaitingSummaryPrompt) {
      const lowerText = text.toLowerCase();
      const wantsSummary = CONFIRMATION_KEYWORDS.some(kw => lowerText.includes(kw));
      const skipsSummary = ['no', 'nah', 'nope', 'skip', 'no thanks', 'just submit', 'submit'].some(kw => lowerText.includes(kw));

      if (wantsSummary && !skipsSummary) {
        setIsAwaitingSummaryPrompt(false);
        setIsAwaitingConfirmation(true);
        const summary = buildConfirmationSummary(activeServiceRequest);
        addMessage('ai', summary);
        speakAiResponse(summary);
        return;
      } else if (skipsSummary) {
        setIsAwaitingSummaryPrompt(false);
        setIsAwaitingWorkOrderPrompt(true);
        const submitPrompt = "Ready to submit your request?";
        addMessage('ai', submitPrompt);
        speakAiResponse(submitPrompt);
        return;
      }
      // Ambiguous — re-ask
      const retryMsg = "Want me to read back the details before we submit? Say yes or no.";
      addMessage('ai', retryMsg);
      speakAiResponse(retryMsg);
      return;
    }

    // Handle work order prompt response
    if (isAwaitingWorkOrderPrompt) {
      const lowerText = text.toLowerCase();
      const wantsWorkOrder = CONFIRMATION_KEYWORDS.some(kw => lowerText.includes(kw));
      const declinesWorkOrder = ['no', 'nah', 'nope', 'not now', 'skip', 'no thanks'].some(kw => lowerText.includes(kw));

      if (wantsWorkOrder && !declinesWorkOrder) {
        finalizeServiceRequest(activeServiceRequest);
        setIsAwaitingWorkOrderPrompt(false);
        return;
      } else if (declinesWorkOrder) {
        const ackMsg = "No problem. Your service request has been noted. If you need a work order later, just let me know.";
        addMessage('ai', ackMsg);
        speakAiResponse(ackMsg);
        setIsServiceRequestActive(false);
        setActiveServiceRequest(null);
        setIsAwaitingWorkOrderPrompt(false);
        return;
      }
      // Ambiguous response — re-ask
      const retryMsg = "Just to confirm — would you like me to generate a work order? Yes or no?";
      addMessage('ai', retryMsg);
      speakAiResponse(retryMsg);
      return;
    }

    // Handle confirmation response
    if (isAwaitingConfirmation) {
      const lowerText = text.toLowerCase();
      const isConfirmed = CONFIRMATION_KEYWORDS.some(kw => lowerText.includes(kw));
      const wantsEdit = ['no', 'change', 'edit', 'wrong', 'fix', 'update', 'actually', 'wait', 'incorrect'].some(kw => lowerText.includes(kw));

      if (isConfirmed && !wantsEdit) {
        setIsAwaitingConfirmation(false);
        finalizeServiceRequest(activeServiceRequest);
        return;
      }

      if (wantsEdit) {
        // User wants to change something — fall through to AI conversation
        setIsAwaitingConfirmation(false);
      } else {
        // Ambiguous response — re-ask
        const retryMsg = "Does everything look right? Say yes to confirm or let me know what needs to change.";
        addMessage('ai', retryMsg);
        speakAiResponse(retryMsg);
        return;
      }
    }

    setIsLoadingAI(true);
    try {
      const response = await serviceRequestSession.sendMessage({ message: text });
      const aiText = response.text;

      const newExchange = `user: ${text}\nai: ${aiText}`;
      const fullTranscript = activeServiceRequest.conversation_transcript
        ? `${activeServiceRequest.conversation_transcript}\n\n${newExchange}`
        : newExchange;

      const extractedData = await extractServiceDataFromConversation(
        fullTranscript,
        activeServiceRequest
      );

      const updatedRequest = mergeServiceRequestData(activeServiceRequest, {
        ...extractedData,
        conversation_transcript: fullTranscript,
      });
      setActiveServiceRequest(updatedRequest);

      const validation = validateServiceRequest(updatedRequest);

      if (validation.isComplete) {
        if (FEATURE_FLAGS.SUMMARY_PROMPT_ENABLED) {
          // Original: ask if they want a recap first
          const prompt = "Want me to read back the details before submitting?";
          addMessage('ai', aiText);
          addMessage('ai', prompt);
          speakAiResponse(aiText);
          speakAiResponse(prompt);
          setIsAwaitingSummaryPrompt(true);
        } else {
          // Always show summary immediately
          const summary = buildConfirmationSummary(updatedRequest);
          addMessage('ai', aiText);
          addMessage('ai', summary);
          speakAiResponse(aiText);
          speakAiResponse(summary);
          setIsAwaitingConfirmation(true);
        }
      } else {
        addMessage('ai', aiText);
        speakAiResponse(aiText);
      }
    } catch (error) {
      console.error("Service request error:", error);
      const errorMsg = "Error processing request. Please try again.";
      addMessage('ai', errorMsg);
      speakAiResponse(errorMsg);
    } finally {
      setIsLoadingAI(false);
    }
  }, [serviceRequestSession, activeServiceRequest, isAwaitingConfirmation, isAwaitingWorkOrderPrompt, isAwaitingSummaryPrompt, userProfile, speakAiResponse, addMessage, finalizeServiceRequest]);

  // ── Voice-based counter-proposal review ────────────────────────────────────

  const startVoiceReview = useCallback(async (request: ServiceRequest) => {
    setVoiceReviewRequest(request);
    setAwaitingVoiceCtx('command');
    setIsLoadingAI(true);
    try {
      const agent = new WorkOrderCoordinationAgent(request, 'fleet_user', userProfile.userName || 'Fleet');
      const summary = await agent.getRequestSummary();
      handleAiResponseDisplay(summary);
    } catch (err) {
      console.error('startVoiceReview error:', err);
      handleAiResponseDisplay('Having trouble reading that proposal. Check the notifications tab.');
    } finally {
      setIsLoadingAI(false);
    }
  }, [handleAiResponseDisplay, userProfile.userName]);

  const handleVoiceReviewInput = useCallback(async (text: string) => {
    const lower = text.toLowerCase().trim();
    const ctx = awaitingVoiceCtxRef.current;
    const req = voiceReviewRequestRef.current;
    if (!req) return;

    const resetVoiceReview = () => {
      setVoiceReviewRequest(null);
      setAwaitingVoiceCtx(null);
      setVoiceCounterDate('');
      setVoiceCounterTime('');
    };

    setIsLoadingAI(true);
    try {
      if (ctx === 'command') {
        // Accept
        if (/(^|\b)(accept|approve|sounds good|works for me|go ahead|yes|that works|confirmed|do it)(\b|$)/.test(lower)) {
          await approveProposedTime(req.id);
          resetVoiceReview();
          refreshNotifications();
          refreshRequests();
          const readable = req.proposed_date
            ? new Date(req.proposed_date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            : 'the proposed time';
          handleAiResponseDisplay(`Done. Accepted ${readable} with ${req.assigned_provider_name || 'the provider'}. Your work order is confirmed.`);
          return;
        }
        // Decline
        if (/(^|\b)(decline|reject|no$|pass|won't work|can't make|not good|different)(\b|$)/.test(lower)) {
          setAwaitingVoiceCtx('decline-reason');
          handleAiResponseDisplay("Got it. Want to give the provider a reason, or just say skip?");
          return;
        }
        // Counter-propose — extract date/time anywhere in the utterance
        if (/(counter|propose|different time|how about|reschedule|try|offer|suggest)/.test(lower)) {
          const { date: parsedDate, time: parsedTime } = extractDateTime(text);
          if (parsedDate && parsedTime) {
            setVoiceCounterDate(parsedDate);
            setVoiceCounterTime(parsedTime);
            setAwaitingVoiceCtx('counter-confirm');
            const readable = new Date(`${parsedDate}T${parsedTime}:00`).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            handleAiResponseDisplay(`Counter-propose for ${readable}. Is that right?`);
            return;
          }
          if (parsedDate) {
            setVoiceCounterDate(parsedDate);
            setAwaitingVoiceCtx('counter-time');
            handleAiResponseDisplay('What time works for you?');
            return;
          }
          setAwaitingVoiceCtx('counter-date');
          handleAiResponseDisplay('What date works for you?');
          return;
        }
        // Skip/dismiss
        if (/(^|\b)(skip|later|not now|dismiss|move on|never mind)(\b|$)/.test(lower)) {
          resetVoiceReview();
          handleAiResponseDisplay("No problem — it'll be in your notifications whenever you're ready.");
          return;
        }
        // General question — pass to coordination agent
        const agent = new WorkOrderCoordinationAgent(req, 'fleet_user', userProfile.userName || 'Fleet');
        const response = await agent.sendMessage(text);
        handleAiResponseDisplay(response);
        return;
      }

      if (ctx === 'counter-date') {
        const { date: parsedDate, time: parsedTime } = extractDateTime(text);
        if (parsedDate) {
          if (parsedTime) {
            setVoiceCounterDate(parsedDate);
            setVoiceCounterTime(parsedTime);
            setAwaitingVoiceCtx('counter-confirm');
            const readable = new Date(`${parsedDate}T${parsedTime}:00`).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            handleAiResponseDisplay(`Counter-propose for ${readable}. Is that right?`);
          } else {
            setVoiceCounterDate(parsedDate);
            setAwaitingVoiceCtx('counter-time');
            handleAiResponseDisplay('What time works?');
          }
        } else {
          handleAiResponseDisplay("Didn't catch that date. Try something like next Tuesday or March 10th.");
        }
        return;
      }

      if (ctx === 'counter-time') {
        const parsedTime = parseTimeString(text);
        if (parsedTime) {
          setVoiceCounterTime(parsedTime);
          setAwaitingVoiceCtx('counter-confirm');
          const readable = new Date(`${voiceCounterDateRef.current}T${parsedTime}:00`).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
          handleAiResponseDisplay(`Counter-propose for ${readable}. Is that right?`);
        } else {
          handleAiResponseDisplay("What time works? Try something like 2 PM or 9 in the morning.");
        }
        return;
      }

      if (ctx === 'counter-confirm') {
        const confirmed = /(^|\b)(yes|yeah|yep|correct|right|that's right|sounds good|go ahead|confirm|perfect)(\b|$)/.test(lower);
        const denied = /(^|\b)(no|nope|wrong|change|different|not right|actually)(\b|$)/.test(lower);
        if (confirmed && !denied) {
          const isoDatetime = new Date(`${voiceCounterDateRef.current}T${voiceCounterTimeRef.current}:00`).toISOString();
          await proposeNewTime(req.id, isoDatetime, '');
          const readable = new Date(isoDatetime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
          resetVoiceReview();
          refreshNotifications();
          refreshRequests();
          handleAiResponseDisplay(`Counter-proposal sent for ${readable}.`);
        } else if (denied) {
          setVoiceCounterDate('');
          setVoiceCounterTime('');
          setAwaitingVoiceCtx('counter-date');
          handleAiResponseDisplay('What date and time works for you?');
        } else {
          handleAiResponseDisplay('Say yes to send that counter-proposal, or no to change it.');
        }
        return;
      }

      if (ctx === 'decline-reason') {
        const reason = /(^|\b)(skip|no reason|none|nothing|just decline)(\b|$)/.test(lower) ? undefined : text;
        await rejectProposedTime(req.id, reason);
        resetVoiceReview();
        refreshNotifications();
        refreshRequests();
        handleAiResponseDisplay("Declined. The request has been reopened for other providers to respond.");
        return;
      }
    } catch (err) {
      console.error('handleVoiceReviewInput error:', err);
      handleAiResponseDisplay('Something went wrong. You can manage this from the notifications tab.');
      resetVoiceReview();
    } finally {
      setIsLoadingAI(false);
    }
  }, [handleAiResponseDisplay, refreshNotifications, refreshRequests, userProfile.userName]);

  const handleStatusQuery = useCallback(async () => {
    const all = myRequestsRef.current;

    // Voice counter-proposal review — disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
    if (FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED) {
      // Find counter-proposals from provider that fleet needs to respond to
      const pendingReviews = all.filter(r => {
        const lastBy = r.proposal_history?.slice(-1)[0]?.proposed_by;
        return r.status === 'counter_proposed' && lastBy === 'service_provider';
      });
      if (pendingReviews.length > 0) {
        await startVoiceReview(pendingReviews[0]);
        return;
      }
    }

    setIsLoadingAI(true);
    try {
      const active = all.filter(r => !['completed', 'cancelled', 'rejected'].includes(r.status));
      if (active.length === 0) {
        handleAiResponseDisplay(all.length === 0
          ? "You don't have any service requests yet."
          : "All your service requests have been resolved.");
        return;
      }
      const agent = new WorkOrderCoordinationAgent(active[0], 'fleet_user', userProfile.userName || 'Fleet', active);
      const summary = await agent.sendMessage('Give me a brief status update on all my active service requests.');
      handleAiResponseDisplay(summary);
    } catch (err) {
      console.error('handleStatusQuery error:', err);
      handleAiResponseDisplay('Having trouble checking status right now. Try the notifications tab.');
    } finally {
      setIsLoadingAI(false);
    }
  }, [startVoiceReview, handleAiResponseDisplay, userProfile.userName]);

  const processUserInput = useCallback(async (text: string) => {
    if (!text.trim()) return;

    addMessage('user', text);
    setTranscription(text);

    if (apiKeyError) return;

    // Handle name collection
    if (isAskingName) {
      setIsLoadingAI(true);
      try {
        const name = await extractNameWithAI(text);
        const updatedProfile = { ...userProfile, userName: name };
        setUserProfile(updatedProfile);
        saveUserProfile(updatedProfile);
        setIsAskingName(false);

        const welcomeMsg = `Copy that, ${name}. Nice to have you on board. I'm ready when you are.`;
        handleAiResponseDisplay(welcomeMsg);
      } catch (error) {
        console.error("Error setting name:", error);
        const fallbackMsg = "Didn't quite catch that name, but let's get started.";
        handleAiResponseDisplay(fallbackMsg);
        setIsAskingName(false);
      } finally {
        setIsLoadingAI(false);
      }
      return;
    }

    // Route to active service request handler
    if (isServiceRequestActive) {
      handleServiceRequestResponse(text);
      return;
    }

    if (isWellnessCheckinActive) {
      handleWellnessCheckinResponse(text);
      return;
    }

    // Route to voice counter-proposal review when active
    if (awaitingVoiceCtxRef.current !== null) {
      handleVoiceReviewInput(text);
      return;
    }

    setIsLoadingAI(true);
    const lowerText = text.toLowerCase();

    // Detect status / update queries ("any updates?", "any counter-proposals?", etc.)
    if (/(any update|any response|counter.?proposal|did.*respond|status of my|check.*request|what.*status|what happened)/i.test(lowerText)) {
      setIsLoadingAI(false);
      handleStatusQuery();
      return;
    }

    // Check for service request keywords
    if (SERVICE_REQUEST_KEYWORDS.some(kw => lowerText.includes(kw))) {
      setIsLoadingAI(false);
      startServiceRequest(text);
      return;
    }

    // Check for wellness check-in
    if (WELLNESS_CHECKIN_KEYWORDS.some(kw => lowerText.includes(kw))) {
      startWellnessCheckin();
      setIsLoadingAI(false);
      return;
    }

    // General chat flow
    try {
      const { task: detectedTask } = determineTaskFromInput(text);

      let currentSession = generalChatSession;
      if (!currentSession) {
        currentSession = createNewChatWithTask(
          detectedTask,
          userProfile.voiceInput.language,
          userProfile.userName
        );
        setGeneralChatSession(currentSession);
      }

      const response = await currentSession.sendMessage({ message: text });
      const aiText = response.text;

      handleAiResponseDisplay(aiText);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      handleAiResponseDisplay(`Having some engine trouble here: ${errorMessage || 'Check your connection.'}`);
    } finally {
      setIsLoadingAI(false);
    }
  }, [
    apiKeyError, generalChatSession, handleAiResponseDisplay,
    isWellnessCheckinActive, handleWellnessCheckinResponse, startWellnessCheckin,
    isServiceRequestActive, handleServiceRequestResponse, startServiceRequest,
    userProfile, isAskingName, handleVoiceReviewInput, handleStatusQuery,
  ]);

  const toggleListen = useCallback(async () => {
    await initializeAudio();

    if (isListeningRef.current) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setIsListening(false);
    } else {
      if (isSpeaking && userProfile.voiceOutput.enabled) {
        stopAudioPlayback();
        speechQueueRef.current = Promise.resolve(); // discard any queued speech
        setIsSpeaking(false);
      }

      const recognition = getSpeechRecognition();
      if (recognition) {
        speechRecognitionRef.current = recognition;
        recognition.lang = userProfile.voiceInput.language;
        recognition.continuous = true;
        recognition.interimResults = true;

        transcriptAccumulatorRef.current = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            transcriptAccumulatorRef.current += finalTranscript;
          }

          const currentTranscript = transcriptAccumulatorRef.current + interimTranscript;
          setTranscription(currentTranscript);

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          silenceTimerRef.current = setTimeout(() => {
            if (speechRecognitionRef.current && transcriptAccumulatorRef.current.trim()) {
              speechRecognitionRef.current.stop();
              const finalText = transcriptAccumulatorRef.current.trim();
              processUserInput(finalText);
              transcriptAccumulatorRef.current = '';
              setIsListening(false);
            }
          }, 1500);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        };

        setIsListening(true);
        recognition.start();
      }
    }
  }, [isSpeaking, userProfile, processUserInput]);

  useEffect(() => { toggleListenRef.current = toggleListen; }, [toggleListen]);

  const handleChatSend = useCallback((message: string) => {
    if (!message.trim()) return;
    initializeAudio().catch(() => {}); // unlock AudioContext during user gesture
    processUserInput(message);
  }, [processUserInput]);

  const handlePDFDownload = async () => {
    if (!completedServiceRequest) return;

    try {
      const blob = await generateServiceRequestPDF(completedServiceRequest);
      const filename = `work-order-${completedServiceRequest.urgency}-${completedServiceRequest.id.slice(0, 8)}.pdf`;
      downloadPDF(blob, filename);

      setTimeout(() => {
        setCompletedServiceRequest(null);
        setTranscription('');
      }, 1000);
    } catch (error) {
      console.error('PDF generation failed:', error);
    }
  };

  const handleSaveSettings = (newProfile: UserProfile) => {
    const languageChanged = newProfile.voiceInput.language !== userProfile.voiceInput.language;

    setUserProfile(newProfile);
    saveUserProfile(newProfile);
    setIsSettingsModalOpen(false);

    if (languageChanged) {
      setGeneralChatSession(null);
      setVehicleInspectionSession(null);
    }

    if (!newProfile.voiceOutput.enabled && isSpeaking) {
      stopAudioPlayback();
      setIsSpeaking(false);
    }
  };

  // Fleet Counter-Proposal Form (overlay — propose different time)
  // Disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
  if (FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED && counterProposingRequest) {
    return (
      <>
        <FleetCounterProposalForm
          request={counterProposingRequest}
          isDark={isDark}
          onBack={() => setCounterProposingRequest(null)}
          onSubmit={async (data) => {
            try {
              await proposeNewTime(counterProposingRequest.id, data.proposed_datetime, data.notes || undefined);
              setCounterProposingRequest(null);
              setReviewingRequest(null);
              refreshNotifications();
              refreshRequests();
            } catch (err) {
              console.error('Failed to propose new time:', err);
            }
          }}
        />
        <BottomMenuBar isDark={isDark} role="fleet" activeTab={currentTab} badgeCount={unreadCount} onNavigate={(tab) => { setCounterProposingRequest(null); setReviewingRequest(null); if (tab === 'notifications') markAllRead(); setCurrentTab(tab as NavigationTab); }} />
      </>
    );
  }

  // Counter-Proposal Review (overlay)
  // Disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
  if (FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED && reviewingRequest) {
    return (
      <>
        <CounterProposalReview
          request={reviewingRequest}
          isDark={isDark}
          onBack={() => setReviewingRequest(null)}
          onResolved={() => {
            setReviewingRequest(null);
            refreshNotifications();
            refreshRequests();
          }}
          onProposeDifferentTime={(req) => setCounterProposingRequest(req)}
        />
        <BottomMenuBar isDark={isDark} role="fleet" activeTab={currentTab} badgeCount={unreadCount} onNavigate={(tab) => { setReviewingRequest(null); if (tab === 'notifications') markAllRead(); setCurrentTab(tab as NavigationTab); }} />
      </>
    );
  }

  // Notifications tab
  if (currentTab === 'notifications') {
    return (
      <>
        <NotificationsView
          notifications={notifications}
          requests={myRequests}
          isDark={isDark}
          isLoading={isLoadingRequests}
          onReviewCounterProposal={(req) => {
            // Disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
            if (FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED && req.status === 'counter_proposed') {
              setReviewingRequest(req);
            }
          }}
          onViewDetail={(req) => {
            // Use proposal_history to detect fleet's turn — works on same-device testing
            const lastBy = req.proposal_history?.length
              ? req.proposal_history[req.proposal_history.length - 1].proposed_by
              : null;
            // Disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
            if (FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED && req.status === 'counter_proposed' && lastBy === 'service_provider') {
              setReviewingRequest(req);
            } else {
              setDetailRequest(req);
            }
          }}
        />
        {detailRequest && (
          <RequestDetailModal
            request={detailRequest}
            isDark={isDark}
            onClose={() => setDetailRequest(null)}
            onReviewCounterProposal={(() => {
              // Disabled: FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED
              if (!FEATURE_FLAGS.COUNTER_PROPOSAL_UI_ENABLED) return undefined;
              if (detailRequest.status !== 'counter_proposed') return undefined;
              const lastBy = detailRequest.proposal_history?.length
                ? detailRequest.proposal_history[detailRequest.proposal_history.length - 1].proposed_by
                : null;
              if (lastBy !== 'service_provider') return undefined;
              return () => { setDetailRequest(null); setReviewingRequest(detailRequest); };
            })()}
          />
        )}
        <BottomMenuBar isDark={isDark} role="fleet" activeTab={currentTab} badgeCount={unreadCount} onNavigate={(tab) => { if (tab === 'notifications') markAllRead(); setCurrentTab(tab as NavigationTab); }} />
      </>
    );
  }

  // Settings Page
  if (currentTab === 'settings') {
    return (
      <>
        <SettingsPage
          isDark={isDark}
          currentVoice={userProfile.voiceOutput.voiceURI || 'onyx'}
          currentLanguage={userProfile.voiceInput.language}
          onSave={(settings) => {
            const updatedProfile = {
              ...userProfile,
              voiceOutput: {
                ...userProfile.voiceOutput,
                enabled: true,
                voiceURI: settings.voicePersona,
              },
              voiceInput: {
                ...userProfile.voiceInput,
                language: settings.language,
              },
            };
            setUserProfile(updatedProfile);
            saveUserProfile(updatedProfile);
            setCurrentTab('home');
          }}
          onCancel={() => setCurrentTab('home')}
          onSwitchRole={onSwitchRole}
        />
        <BottomMenuBar
          isDark={isDark}
          role="fleet"
          activeTab={currentTab}
          badgeCount={unreadCount}
          onNavigate={(tab) => setCurrentTab(tab as NavigationTab)}
        />
      </>
    );
  }

  // Start screen (tap to start voice assistant)
  if (!assistantStarted) {
    return (
      <>
        <div
          className="flex flex-col items-center justify-center h-screen"
          style={{ background: isDark ? '#000000' : '#F2F2F7' }}
          onClick={handleStartAssistant}
        >
          <div className="text-center">
            <div style={{ fontSize: '72px', marginBottom: '24px', color: 'var(--accent-blue)' }}>
              🚛
            </div>
            <h1 style={{ fontSize: '34px', fontWeight: 'var(--font-weight-bold)', color: 'var(--label-primary)', marginBottom: '12px' }}>
              Michelin Services
            </h1>
            <p style={{ fontSize: '20px', color: 'var(--label-secondary)', marginBottom: '40px' }}>
              Powered by Serv
            </p>
            <div style={{ fontSize: '15px', color: 'var(--label-tertiary)', cursor: 'pointer' }}>
              Tap anywhere to start
            </div>
          </div>
        </div>
        <BottomMenuBar isDark={isDark} role="fleet" activeTab={currentTab} badgeCount={unreadCount} onNavigate={(tab) => { if (tab === 'notifications') markAllRead(); setCurrentTab(tab as NavigationTab); }} />
      </>
    );
  }

  // Main voice UI
  return (
    <div
      onClick={() => {
        if (!isLoadingAI && !apiKeyError && !isSpeaking) {
          toggleListen();
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        cursor: isLoadingAI || !!apiKeyError ? 'not-allowed' : 'pointer'
      }}
    >
      {/* Offline Indicator */}
      {!isOnline && (
        <div
          style={{
            position: 'fixed', top: '32px', left: '50%', transform: 'translateX(-50%)',
            padding: '8px 16px', borderRadius: '999px',
            background: isDark ? 'rgba(255, 69, 58, 0.9)' : 'rgba(255, 59, 48, 0.9)',
            color: '#FFFFFF', fontSize: '14px', fontWeight: 'var(--font-weight-medium)', zIndex: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Offline
        </div>
      )}

      {/* Counter-Proposal Notification Banner */}
      {isOnline && unreadCount > 0 && (
        <NotificationBanner
          count={unreadCount}
          isDark={isDark}
          onTap={() => { markAllRead(); setCurrentTab('notifications'); }}
          onDismiss={markAllRead}
        />
      )}

      {/* Realtime Toast Alert */}
      {activeToast && (
        <NotificationToast
          toast={activeToast}
          isDark={isDark}
          onDismiss={dismissToast}
          onTap={() => setCurrentTab('notifications')}
        />
      )}

      {/* Input Mode Toggle */}
      {currentTab === 'home' && (
        <InputModeToggle isDark={isDark} mode={inputMode} onModeChange={setInputMode} />
      )}

      {/* Voice UI States */}
      {currentTab === 'home' && inputMode === 'voice' && (
        <>
          {assistantState === 'idle' && <IdleState isDark={isDark} />}
          {assistantState === 'listening' && <ListeningState isDark={isDark} transcription={transcription} />}
          {assistantState === 'processing' && <ProcessingState isDark={isDark} transcription={transcription} />}
          {assistantState === 'responding' && <RespondingState isDark={isDark} transcription={transcription} isComplete={isResponseComplete} />}
          {assistantState === 'urgent' && <UrgentResponseState isDark={isDark} transcription={transcription} />}
          {assistantState === 'resolution' && <ResolutionState isDark={isDark} />}
          {assistantState === 'pdf-generating' && <PDFGeneratingState isDark={isDark} documentName="Work Order" />}
          {assistantState === 'pdf-ready' && completedServiceRequest && (
            <PDFReadyState isDark={isDark} serviceRequest={completedServiceRequest} onDownload={handlePDFDownload} />
          )}
        </>
      )}

      {/* Chat Interface */}
      {currentTab === 'home' && inputMode === 'chat' && (
        <ChatInterface
          isDark={isDark} messages={messages} onSendMessage={handleChatSend}
          onSwitchToVoice={() => setInputMode('voice')} isAIResponding={isLoadingAI}
        />
      )}

      {/* Modals */}
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)}
          currentProfile={userProfile} onSave={handleSaveSettings} availableVoices={availableVoices}
        />
      )}

      {activeModal?.type === 'parkingConfirmation' && (
        <Modal isOpen={true} onClose={() => setActiveModal(null)} title="Confirm Booking">
          <p className="mb-4">Book parking at {(activeModal.data as ParkingSpot).name}?</p>
          <div className="flex justify-end space-x-2">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-gray-600 rounded">Cancel</button>
            <button onClick={() => {
              const spotName = (activeModal.data as ParkingSpot).name;
              speakAiResponse(`10-4. Simulated booking for ${spotName}. Call ahead to confirm.`);
              setActiveModal(null);
            }} className="px-4 py-2 bg-blue-600 rounded">Confirm</button>
          </div>
        </Modal>
      )}

      {/* Bottom Menu Bar */}
      <BottomMenuBar
        isDark={isDark}
        role="fleet"
        activeTab={currentTab}
        badgeCount={unreadCount}
        onNavigate={(tab) => {
          if (tab === 'home') {
            setAssistantStarted(false);
            setIsListening(false);
            setIsSpeaking(false);
            setIsLoadingAI(false);
            setTranscription('');
            stopAudioPlayback();
          }
          if (tab === 'notifications') markAllRead();
          setCurrentTab(tab as NavigationTab);
        }}
      />
    </div>
  );
};

export default FleetApp;
