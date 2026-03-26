import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { ServiceRequest } from '../../types';
import {
  isSupabaseConfigured,
  getServiceRequests,
  subscribeToServiceRequests,
} from '../../services/supabaseService';
import { generateSpeech } from '../../services/aiService';
import {
  getSpeechRecognition,
  playAudioContent,
  stopAudioPlayback,
  initializeAudio,
  SpeechRecognition,
  SpeechRecognitionEvent,
} from '../../services/speechService';
import {
  WorkOrderCoordinationAgent,
  parseTimeString,
  extractDateTime,
  extractProposedDateTime,
} from '../../services/coordinationAgentService';

// ── Types ────────────────────────────────────────────────────────────────────

type AssistantState = 'idle' | 'listening' | 'processing' | 'responding';
type AwaitingContext = 'command' | 'decline-reason' | 'counter-date' | 'counter-time' | 'counter-confirm' | null;

interface ProviderVoiceAssistantProps {
  isDark: boolean;
  userId?: string | null;
  voiceName?: string;
  language?: string;
  onAccept: (request: ServiceRequest) => Promise<void>;
  onReject: (requestId: string, reason: string) => Promise<void>;
  onCounter: (requestId: string, data: { proposed_datetime: string; notes: string }) => Promise<void>;
}

const DEFAULT_VOLUME = 0.9;
const SILENCE_TIMEOUT_MS = 1500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSeenIds(): Set<string> {
  try {
    const stored = sessionStorage.getItem('provider_seen_requests');
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem('provider_seen_requests', JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

// Tracks IDs we've already briefly announced — prevents re-announcing on tab revisit
function getAnnouncedIds(): Set<string> {
  try {
    const stored = sessionStorage.getItem('provider_announced_ids');
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveAnnouncedIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem('provider_announced_ids', JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function formatDateTimeForSpeech(date: string, time: string): string {
  try {
    return new Date(`${date}T${time}:00`).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return `${date} at ${time}`;
  }
}

// Match user input to a specific pending request by recency keywords or data fields
// (fleet name, driver name, service type, urgency, location)
function findMatchingRequest(input: string, requests: ServiceRequest[]): ServiceRequest | null {
  if (!requests.length) return null;
  const lower = input.toLowerCase();

  // Recency keywords → most recently submitted
  if (/(newest|most recent|latest|just came in|last one)/.test(lower)) {
    return [...requests].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  }

  // Score each request against the fields mentioned in the input
  let bestMatch: ServiceRequest | null = null;
  let bestScore = 0;

  for (const req of requests) {
    let score = 0;
    const serviceReadable = req.service_type.toLowerCase().replace(/_/g, ' ');
    const urgencyReadable = req.urgency.toLowerCase().replace(/_/g, ' ');
    const checks: Array<[string, number]> = [
      [req.fleet_name, 3],
      [req.driver_name, 2],
      [serviceReadable, 2],
      [urgencyReadable, 1],
      [req.location.current_location ?? '', 1],
      [req.location.highway_or_road ?? '', 1],
    ];

    for (const [val, weight] of checks) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (lower.includes(v)) {
        score += weight * 2;
      } else {
        for (const word of v.split(/\s+/)) {
          if (word.length > 3 && lower.includes(word)) score += weight;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = req;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

// Returns a request only when it is uniquely named (fleet / driver) in the agent's response
function findRequestInText(text: string, requests: ServiceRequest[]): ServiceRequest | null {
  const lower = text.toLowerCase();
  const mentioned = requests.filter(req => {
    const terms = [req.fleet_name, req.driver_name].filter(Boolean);
    return terms.some(t => t && lower.includes(t.toLowerCase()));
  });
  return mentioned.length === 1 ? mentioned[0] : null;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ProviderVoiceAssistant: React.FC<ProviderVoiceAssistantProps> = ({
  isDark,
  userId,
  voiceName = '21m00Tcm4TlvDq8ikWAM',
  language = 'en-US',
  onAccept,
  onReject,
  onCounter,
}) => {
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [displayText, setDisplayText] = useState('Tap to speak.');
  const [pendingRequests, setPendingRequests] = useState<ServiceRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [awaitingContext, setAwaitingContext] = useState<AwaitingContext>(null);
  const [counterDate, setCounterDate] = useState('');
  const [counterTime, setCounterTime] = useState('');
  const [hasAnnounced, setHasAnnounced] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Refs for stale-closure prevention inside speech recognition callbacks
  const isListeningRef = useRef(false);
  const awaitingContextRef = useRef<AwaitingContext>(null);
  const activeRequestRef = useRef<ServiceRequest | null>(null);
  const counterDateRef = useRef('');
  const counterTimeRef = useRef('');
  const pendingRequestsRef = useRef<ServiceRequest[]>([]);
  const toggleListenRef = useRef<() => Promise<void>>();
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedTranscriptRef = useRef('');
  const generalAgentRef = useRef<WorkOrderCoordinationAgent | null>(null);
  const perRequestAgentRef = useRef<WorkOrderCoordinationAgent | null>(null);
  const seenIdsRef = useRef<Set<string>>(getSeenIds());
  const announcedIdsRef = useRef<Set<string>>(getAnnouncedIds());

  // Keep refs in sync with state
  useEffect(() => { awaitingContextRef.current = awaitingContext; }, [awaitingContext]);
  useEffect(() => { activeRequestRef.current = activeRequest; }, [activeRequest]);
  useEffect(() => { counterDateRef.current = counterDate; }, [counterDate]);
  useEffect(() => { counterTimeRef.current = counterTime; }, [counterTime]);
  useEffect(() => { pendingRequestsRef.current = pendingRequests; }, [pendingRequests]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchPending = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setHasFetched(true);
      return;
    }
    try {
      const data = await getServiceRequests({ status: ['submitted', 'counter_proposed'] });
      const lastBy = (r: ServiceRequest) =>
        r.proposal_history?.length
          ? r.proposal_history[r.proposal_history.length - 1].proposed_by
          : null;
      const actionRequired = data.filter(
        r => r.status === 'counter_proposed' && lastBy(r) === 'fleet_user'
      );
      const incoming = data.filter(r => r.status === 'submitted');
      setPendingRequests([...actionRequired, ...incoming]);
      generalAgentRef.current = null; // invalidate general agent on refresh
    } catch (err) {
      console.error('ProviderVoiceAssistant fetch error:', err);
    } finally {
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    if (!isSupabaseConfigured()) return;
    const channel = subscribeToServiceRequests(fetchPending);
    return () => { channel?.unsubscribe(); };
  }, [fetchPending]);

  // ── TTS ────────────────────────────────────────────────────────────────────

  const speakAiResponse = useCallback(async (text: string) => {
    setAssistantState('responding');
    setDisplayText(text);
    try {
      const audio = await generateSpeech(text, voiceName);
      if (!audio) {
        setAssistantState('idle');
        return;
      }
      await playAudioContent(audio, DEFAULT_VOLUME, () => {
        setAssistantState('idle');
        // Auto-listen intentionally removed. AudioBufferSourceNode.onended fires
        // before the audio pipeline finishes rendering, so the mic would open while
        // speech is still audible. User taps the orb to speak instead.
      });
    } catch (err) {
      console.error('TTS error:', err);
      setAssistantState('idle');
    }
  }, [voiceName]);

  // ── Proactive announcement — Alexa-style: brief notify for new items only ──

  useEffect(() => {
    if (!hasFetched || hasAnnounced) return;
    setHasAnnounced(true);

    if (pendingRequests.length === 0) {
      setDisplayText("You're all caught up.");
      return;
    }

    const unannounced = pendingRequests.filter(r => !announcedIdsRef.current.has(r.id));
    if (unannounced.length === 0) {
      // Everything already announced — stay silent
      setDisplayText('Tap the mic to ask anything.');
      return;
    }

    // Mark these as announced so revisiting the tab stays silent
    unannounced.forEach(r => announcedIdsRef.current.add(r.id));
    saveAnnouncedIds(announcedIdsRef.current);

    const count = unannounced.length;
    speakAiResponse(`You have ${count} new work order${count !== 1 ? 's' : ''}.`);
  }, [hasFetched, pendingRequests, hasAnnounced, speakAiResponse]);

  // ── Seen ID tracking ───────────────────────────────────────────────────────

  const markRequestSeen = useCallback((id: string) => {
    seenIdsRef.current.add(id);
    saveSeenIds(seenIdsRef.current);
  }, []);

  // ── General agent (all requests in context) ────────────────────────────────

  const getGeneralAgent = useCallback((): WorkOrderCoordinationAgent | null => {
    if (generalAgentRef.current) return generalAgentRef.current;
    const all = pendingRequestsRef.current;
    if (all.length === 0) return null;
    generalAgentRef.current = new WorkOrderCoordinationAgent(
      all[0],
      'service_provider',
      'Provider',
      all
    );
    return generalAgentRef.current;
  }, []);

  // ── Action handlers ────────────────────────────────────────────────────────

  const advanceToNextRequest = useCallback(async () => {
    const current = activeRequestRef.current;
    if (current) markRequestSeen(current.id);
    setActiveRequest(null);
    setAwaitingContext(null);
    perRequestAgentRef.current = null;

    const unread = pendingRequestsRef.current.filter(r => !seenIdsRef.current.has(r.id));
    if (unread.length === 0) {
      await speakAiResponse('Got it. No more new work orders right now.');
      return;
    }
    const req = unread[0];
    setActiveRequest(req);
    const agent = new WorkOrderCoordinationAgent(req, 'service_provider', 'Provider');
    perRequestAgentRef.current = agent;
    const summary = await agent.getRequestSummary();
    setAwaitingContext('command');
    await speakAiResponse(summary);
  }, [speakAiResponse, markRequestSeen]);

  const handleVoiceAccept = useCallback(async (request: ServiceRequest) => {
    try {
      await onAccept(request);
      const fleet = request.fleet_name;
      markRequestSeen(request.id);
      await fetchPending();
      setActiveRequest(null);
      setAwaitingContext(null);
      perRequestAgentRef.current = null;
      await speakAiResponse(`Done, accepted the work order from ${fleet}.`);
    } catch (err) {
      console.error('handleVoiceAccept error:', err);
      setAwaitingContext(null);
      await speakAiResponse('There was an issue accepting that. Please try from the dashboard.');
    }
  }, [onAccept, speakAiResponse, markRequestSeen, fetchPending]);

  const handleVoiceDecline = useCallback(async (request: ServiceRequest, reason: string) => {
    try {
      await onReject(request.id, reason);
      const fleet = request.fleet_name;
      markRequestSeen(request.id);
      await fetchPending();
      setActiveRequest(null);
      setAwaitingContext(null);
      perRequestAgentRef.current = null;
      await speakAiResponse(`Declined the work order from ${fleet}.`);
    } catch (err) {
      console.error('handleVoiceDecline error:', err);
      setAwaitingContext(null);
      await speakAiResponse("Couldn't decline that right now. Please try from the dashboard.");
    }
  }, [onReject, speakAiResponse, markRequestSeen, fetchPending]);

  const handleVoiceCounter = useCallback(async (request: ServiceRequest, date: string, time: string) => {
    try {
      const isoDatetime = new Date(`${date}T${time}:00`).toISOString();
      await onCounter(request.id, { proposed_datetime: isoDatetime, notes: '' });
      const readable = new Date(isoDatetime).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      markRequestSeen(request.id);
      await fetchPending();
      setActiveRequest(null);
      setAwaitingContext(null);
      setCounterDate('');
      setCounterTime('');
      perRequestAgentRef.current = null;
      await speakAiResponse(`Counter-proposal sent for ${readable}.`);
    } catch (err) {
      console.error('handleVoiceCounter error:', err);
      setAwaitingContext(null);
      await speakAiResponse("Couldn't submit that counter-proposal. Please try from the dashboard.");
    }
  }, [onCounter, speakAiResponse, markRequestSeen, fetchPending]);

  const readNextRequest = useCallback(async () => {
    const unread = pendingRequestsRef.current.filter(r => !seenIdsRef.current.has(r.id));
    if (unread.length === 0) {
      const total = pendingRequestsRef.current.length;
      if (total === 0) {
        await speakAiResponse("No pending work orders right now. Check back later.");
      } else {
        await speakAiResponse(`All ${total} work order${total !== 1 ? 's are' : ' is'} ones you've already reviewed. Say the fleet name to pull one up again.`);
      }
      return;
    }
    const req = unread[0];
    setActiveRequest(req);
    const agent = new WorkOrderCoordinationAgent(req, 'service_provider', 'Provider');
    perRequestAgentRef.current = agent;
    const summary = await agent.getRequestSummary();
    setAwaitingContext('command');
    await speakAiResponse(summary);
  }, [speakAiResponse]);

  // ── Main input processor ───────────────────────────────────────────────────

  const processProviderInput = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setAssistantState('processing');
    setTranscription('');
    const lower = input.toLowerCase().trim();
    let effectiveCtx = awaitingContextRef.current;
    let effectiveReq = activeRequestRef.current;

    try {
      // ── Shared action regexes ──────────────────────────────────────────────
      const ACCEPT_RE = /(^|\b)(accept|take it|i'?ll take it|yes|yeah|yep|sure|sounds good|go ahead|that works|works for me|i can do (that|it)|i'?m available|book it|send it over|confirmed|do it|let'?s do it|i'?m in|count me in|absolutely|definitely|great|perfect|i'?ll do it|that'?s fine)(\b|$)/i;
      const DECLINE_RE = /(^|\b)(decline|reject|pass|no thanks|not available|can'?t do (it|that)|cannot|busy|not interested|too far|i'?ll pass|no can do|won'?t work|doesn'?t work|not going to work|i'?m not available|skip it|can'?t make it|not for me|i'?d rather not)(\b|$)/i;
      const COUNTER_RE = /(counter|propose|different time|can't make|how about|offer|suggest|reschedule|see if|what if|can we|could we|instead)/i;

      // ── Request identification: match input to a specific pending request ──────
      //    Supports recency ("newest", "most recent") and any request data field
      //    (fleet name, driver name, service type, urgency, location)
      if (effectiveCtx === null && effectiveReq === null) {
        const matched = findMatchingRequest(input, pendingRequestsRef.current);
        if (matched) {
          effectiveReq = matched;
          effectiveCtx = 'command';
          setActiveRequest(matched);
          setAwaitingContext('command');
          activeRequestRef.current = matched;
          awaitingContextRef.current = 'command';
          if (!perRequestAgentRef.current) {
            perRequestAgentRef.current = new WorkOrderCoordinationAgent(matched, 'service_provider', 'Provider');
          }
        }
      }

      // ── Action flow (focused on a specific request) ────────────────────────
      if (effectiveCtx === 'command' && effectiveReq) {
        // Accept
        if (ACCEPT_RE.test(lower)) {
          await handleVoiceAccept(effectiveReq);
          return;
        }
        // Decline
        if (DECLINE_RE.test(lower)) {
          setAwaitingContext('decline-reason');
          await speakAiResponse('Got it. Want to give a reason, or just say skip to decline without one?');
          return;
        }
        // Counter — use AI extraction so negations like "I can't do Tuesday,
        // how about Monday at 9" resolve to the correct proposed day.
        if (COUNTER_RE.test(lower)) {
          const { date, time } = await extractProposedDateTime(input);
          if (date && time) {
            setCounterDate(date);
            setCounterTime(time);
            setAwaitingContext('counter-confirm');
            await speakAiResponse(`Counter-propose for ${formatDateTimeForSpeech(date, time)}. Is that right?`);
          } else if (date) {
            setCounterDate(date);
            setAwaitingContext('counter-time');
            await speakAiResponse('And what time works?');
          } else if (time) {
            setCounterTime(time);
            setAwaitingContext('counter-date');
            await speakAiResponse("Got the time. Which day works for you?");
          } else {
            setAwaitingContext('counter-date');
            await speakAiResponse('What date and time works for you?');
          }
          return;
        }
        // Next
        if (/(^|\b)(next|skip|done|move on|no more)(\b|$)/.test(lower)) {
          await advanceToNextRequest();
          return;
        }
        // Implicit counter-propose: user gave a complete date+time without a trigger keyword
        // (e.g. "3pm on Tuesday" in response to the agent asking "what time works?")
        // Require BOTH date and time to avoid false positives from incidental date mentions.
        const { date: implicitDate, time: implicitTime } = extractDateTime(input);
        if (implicitDate && implicitTime) {
          setCounterDate(implicitDate);
          setCounterTime(implicitTime);
          setAwaitingContext('counter-confirm');
          await speakAiResponse(`Counter-propose for ${formatDateTimeForSpeech(implicitDate, implicitTime)}. Is that right?`);
          return;
        }

        // Anything else: pass to per-request agent (reuse session — preserves
        // conversation history so the agent won't re-summarize the work order)
        const agentIsNew = !perRequestAgentRef.current;
        if (agentIsNew) {
          perRequestAgentRef.current = new WorkOrderCoordinationAgent(effectiveReq, 'service_provider', 'Provider');
        }
        // If the agent is brand-new (no prior summary turn), prime it with a
        // context message so it knows the overview was already read aloud and
        // it should answer the provider's question directly rather than re-introduce.
        if (agentIsNew) {
          await perRequestAgentRef.current.sendMessage(
            '[System: The provider has already heard the work order summary. Answer their next question directly without re-summarizing.]'
          );
        }
        const response = await perRequestAgentRef.current.sendMessage(input);
        await speakAiResponse(response);
        return;
      }

      if (effectiveCtx === 'decline-reason') {
        const reason = /(^|\b)(skip|no reason|none|nothing|just decline)(\b|$)/.test(lower) ? '' : input;
        await handleVoiceDecline(effectiveReq!, reason);
        return;
      }

      if (effectiveCtx === 'counter-date') {
        // Try fast regex first; fall back to AI for phrases like "the 15th" or "March 9th"
        let { date, time } = extractDateTime(input);
        if (!date) ({ date, time } = await extractProposedDateTime(input));
        if (date) {
          const resolvedTime = time || counterTimeRef.current;
          if (resolvedTime) {
            setCounterDate(date);
            setCounterTime(resolvedTime);
            setAwaitingContext('counter-confirm');
            await speakAiResponse(`Counter-propose for ${formatDateTimeForSpeech(date, resolvedTime)}. Is that right?`);
          } else {
            setCounterDate(date);
            setAwaitingContext('counter-time');
            await speakAiResponse('And what time works?');
          }
        } else {
          await speakAiResponse("Didn't catch that. What day works for you?");
        }
        return;
      }

      if (effectiveCtx === 'counter-time') {
        const parsedTime = parseTimeString(input);
        if (parsedTime) {
          setCounterTime(parsedTime);
          setAwaitingContext('counter-confirm');
          await speakAiResponse(`Counter-propose for ${formatDateTimeForSpeech(counterDateRef.current, parsedTime)}. Is that right?`);
        } else {
          await speakAiResponse("What time works? For example, 2 PM or 9 in the morning.");
        }
        return;
      }

      if (effectiveCtx === 'counter-confirm') {
        const confirmed = /(^|\b)(yes|yeah|yep|correct|right|that's right|sounds good|go ahead|confirm|perfect)(\b|$)/.test(lower);
        const denied = /(^|\b)(no|nope|wrong|change|different|not right|actually)(\b|$)/.test(lower);
        if (confirmed && !denied) {
          await handleVoiceCounter(effectiveReq!, counterDateRef.current, counterTimeRef.current);
        } else if (denied) {
          setCounterDate('');
          setCounterTime('');
          setAwaitingContext('counter-date');
          await speakAiResponse('What date and time works for you?');
        } else {
          await speakAiResponse('Say yes to send that counter-proposal, or no to change it.');
        }
        return;
      }

      // ── General queries (no active action context) ────────────────────────
      if (/(read|tell me|what('s| is)|new (ones|requests)|work orders|hear them|first one|any(thing)?(\s+new)?)/.test(lower)) {
        await readNextRequest();
        return;
      }

      // Route to general agent
      const generalAgent = getGeneralAgent();
      if (generalAgent) {
        const response = await generalAgent.sendMessage(input);
        // If the agent's response uniquely names one pending request (by fleet / driver),
        // pre-set it as active so the next user turn can immediately act on it
        // (e.g. say "yes" or "accept" after the agent asks "Do you want to accept X?")
        const impliedReq = findRequestInText(response, pendingRequestsRef.current);
        if (impliedReq) {
          setActiveRequest(impliedReq);
          setAwaitingContext('command');
          activeRequestRef.current = impliedReq;
          awaitingContextRef.current = 'command';
          if (!perRequestAgentRef.current) {
            perRequestAgentRef.current = new WorkOrderCoordinationAgent(impliedReq, 'service_provider', 'Provider');
          }
        }
        await speakAiResponse(response);
      } else {
        await speakAiResponse("You're all caught up — no pending work orders right now.");
      }
    } catch (err) {
      console.error('processProviderInput error:', err);
      setAssistantState('idle');
      setDisplayText('Something went wrong. Please try again.');
    }
  }, [
    speakAiResponse, getGeneralAgent, readNextRequest,
    handleVoiceAccept, handleVoiceDecline, handleVoiceCounter, advanceToNextRequest,
  ]);

  // ── Speech Recognition ─────────────────────────────────────────────────────

  const toggleListen = useCallback(async () => {
    await initializeAudio();

    if (isListeningRef.current) {
      recognitionRef.current?.stop();
      isListeningRef.current = false;
      setIsListening(false);
      setAssistantState('idle');
      return;
    }

    const recognition = getSpeechRecognition();
    if (!recognition) {
      await speakAiResponse(
        "Speech recognition isn't available in this browser. Use the dashboard to manage work orders."
      );
      return;
    }

    stopAudioPlayback(); // kill any lingering audio before mic opens
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    accumulatedTranscriptRef.current = '';

    const micOpenedAt = Date.now();

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Discard results within the first 300ms — prevents acoustic echo from
      // the speaker being captured as user input right after TTS ends.
      if (Date.now() - micOpenedAt < 300) return;

      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          finalChunk += r[0].transcript;
        } else {
          interimChunk += r[0].transcript;
        }
      }
      if (finalChunk) accumulatedTranscriptRef.current += finalChunk;
      const display = (accumulatedTranscriptRef.current + (interimChunk ? ' ' + interimChunk : '')).trim();
      setTranscription(display);

      // Reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) recognition.stop();
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('Speech recognition error:', event.error);
      isListeningRef.current = false;
      setIsListening(false);
      setAssistantState('idle');
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      const transcript = accumulatedTranscriptRef.current.trim();
      if (transcript) {
        processProviderInput(transcript);
      } else {
        setAssistantState('idle');
      }
    };

    recognition.start();
    isListeningRef.current = true;
    setIsListening(true);
    setAssistantState('listening');
    setTranscription('');
  }, [speakAiResponse, processProviderInput]);

  useEffect(() => { toggleListenRef.current = toggleListen; }, [toggleListen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopAudioPlayback();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const newCount = pendingRequests.filter(r => !seenIdsRef.current.has(r.id)).length;

  // Context hint shown below orb
  const contextHint =
    awaitingContext === 'command'
      ? "Say: accept, decline, counter, or next"
      : awaitingContext === 'decline-reason'
        ? "Say a reason, or 'skip'"
        : awaitingContext === 'counter-date'
          ? "What date and time works?"
          : awaitingContext === 'counter-time'
            ? "What time?"
            : awaitingContext === 'counter-confirm'
              ? "Say yes to confirm or no to change"
            : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: isDark
          ? 'linear-gradient(180deg, #000000 0%, #1C1C1E 100%)'
          : 'linear-gradient(180deg, #F2F2F7 0%, #FFFFFF 100%)',
        paddingTop: '60px',
        paddingBottom: '100px',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '34px',
            fontWeight: '700',
            letterSpacing: '-0.02em',
            color: isDark ? 'var(--label-primary)' : '#000000',
            margin: 0,
            marginBottom: '8px',
          }}
        >
          Assistant
        </h1>
        <p style={{ fontSize: '17px', color: 'var(--label-secondary)', margin: 0 }}>
          {pendingRequests.length === 0
            ? 'No pending work orders'
            : newCount > 0
              ? `${newCount} new update${newCount !== 1 ? 's' : ''}`
              : `${pendingRequests.length} work order${pendingRequests.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Orb + display text — vertically centered */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 32px',
          gap: '28px',
        }}
      >
        {/* Tappable orb — matches fleet interaction pattern */}
        <div
          onClick={() => { if (assistantState !== 'processing') toggleListen(); }}
          style={{ cursor: assistantState === 'processing' ? 'default' : 'pointer' }}
        >
        {assistantState === 'idle' && (
          <motion.div
            className="relative"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: [1, 1.03, 1], opacity: [0.7, 0.85, 0.7] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative w-28 h-28">
              <div className="absolute inset-0 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.35) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.25) 0%, transparent 70%)',
                filter: 'blur(16px)',
              }} />
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.65) 0%, rgba(255, 149, 0, 0.3) 100%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.55) 0%, rgba(255, 149, 0, 0.25) 100%)',
                boxShadow: isDark
                  ? '0 0 32px rgba(255, 149, 0, 0.4), inset 0 0 16px rgba(255, 149, 0, 0.3)'
                  : '0 0 28px rgba(255, 149, 0, 0.35), inset 0 0 14px rgba(255, 149, 0, 0.25)',
              }} />
            </div>
          </motion.div>
        )}

        {assistantState === 'listening' && (
          <motion.div
            className="relative"
            initial={{ scale: 1, opacity: 0.85 }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.5) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.4) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }} />
              <div className="absolute inset-0 m-auto w-24 h-24 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.6) 0%, transparent 80%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.5) 0%, transparent 80%)',
                filter: 'blur(12px)',
              }} />
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.85) 0%, rgba(255, 149, 0, 0.4) 100%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.75) 0%, rgba(255, 149, 0, 0.35) 100%)',
                boxShadow: isDark
                  ? '0 0 40px rgba(255, 149, 0, 0.6), inset 0 0 20px rgba(255, 149, 0, 0.5)'
                  : '0 0 36px rgba(255, 149, 0, 0.5), inset 0 0 18px rgba(255, 149, 0, 0.4)',
              }} />
            </div>
          </motion.div>
        )}

        {assistantState === 'processing' && (
          <motion.div
            className="relative"
            initial={{ scale: 1, opacity: 0.9 }}
            animate={{ scale: [1, 1.02, 1], opacity: [0.9, 0.95, 0.9] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.42) 0%, transparent 60%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.32) 0%, transparent 60%)',
                filter: 'blur(14px)',
              }} />
              <div className="absolute inset-0 m-auto w-24 h-24 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.52) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.42) 0%, transparent 70%)',
                filter: 'blur(10px)',
              }} />
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.78) 0%, rgba(255, 149, 0, 0.36) 100%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.68) 0%, rgba(255, 149, 0, 0.3) 100%)',
                boxShadow: isDark
                  ? '0 0 32px rgba(255, 149, 0, 0.5), inset 0 0 16px rgba(255, 149, 0, 0.4)'
                  : '0 0 28px rgba(255, 149, 0, 0.4), inset 0 0 14px rgba(255, 149, 0, 0.35)',
              }} />
            </div>
          </motion.div>
        )}

        {assistantState === 'responding' && (
          <motion.div
            className="relative"
            initial={{ scale: 1, opacity: 0.92 }}
            animate={{ scale: [1, 1.015, 1], opacity: [0.92, 0.96, 0.92] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.45) 0%, transparent 65%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.35) 0%, transparent 65%)',
                filter: 'blur(18px)',
              }} />
              <div className="absolute inset-0 m-auto w-24 h-24 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.55) 0%, transparent 75%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.45) 0%, transparent 75%)',
                filter: 'blur(12px)',
              }} />
              <div className="absolute inset-0 m-auto w-20 h-20 rounded-full" style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(255, 149, 0, 0.8) 0%, rgba(255, 149, 0, 0.38) 100%)'
                  : 'radial-gradient(circle, rgba(255, 149, 0, 0.7) 0%, rgba(255, 149, 0, 0.32) 100%)',
                boxShadow: isDark
                  ? '0 0 36px rgba(255, 149, 0, 0.55), inset 0 0 18px rgba(255, 149, 0, 0.45)'
                  : '0 0 32px rgba(255, 149, 0, 0.45), inset 0 0 16px rgba(255, 149, 0, 0.38)',
              }} />
            </div>
          </motion.div>
        )}
        </div>{/* end tappable orb wrapper */}

        {/* Text display area */}
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            minHeight: '100px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          {isListening && transcription ? (
            <p
              style={{
                fontSize: '17px',
                color: 'var(--label-secondary)',
                lineHeight: 1.5,
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              {transcription}
            </p>
          ) : (
            <p
              style={{
                fontSize: '17px',
                color:
                  assistantState === 'responding' || assistantState === 'processing'
                    ? isDark ? 'var(--label-primary)' : '#000000'
                    : 'var(--label-secondary)',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {assistantState === 'listening'
                ? 'Listening...'
                : assistantState === 'processing'
                  ? 'One moment...'
                  : displayText}
            </p>
          )}

          {/* Context hint */}
          {contextHint && assistantState === 'idle' && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--label-tertiary)',
                margin: 0,
                letterSpacing: '0.01em',
              }}
            >
              {contextHint}
            </p>
          )}
        </div>
      </div>

    </div>
  );
};
