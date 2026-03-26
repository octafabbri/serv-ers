# Module: Voice UI Components

`components/voice-ui/` contains eight presentational components, one per assistant state. They are pure display — all logic lives in `FleetApp`.

Each component receives props describing what to show (current transcription, AI response text, action callbacks) and renders the appropriate visual for that state.

## State → Component Map

| `assistantState` | Component | Description |
|---|---|---|
| `idle` | `IdleState` | Idle orb; tap to start or continue |
| `listening` | `ListeningState` | Waveform animation while mic is active |
| `processing` | `ProcessingState` | Spinner/animation while AI is thinking |
| `responding` | `RespondingState` | Shows AI response text while TTS plays |
| `urgent` | `UrgentResponseState` | Red/urgent variant of responding (ERS only) |
| `resolution` | `ResolutionState` | "Work order ready" screen before PDF |
| `pdf-generating` | `PDFGeneratingState` | Spinner while PDF is being rendered |
| `pdf-ready` | `PDFReadyState` | Download button + option to start new request |

## Component Details

### IdleState
[components/voice-ui/IdleState.tsx](../../components/voice-ui/IdleState.tsx)

Props: `onStart`, `hasStarted`, `isDark`

The initial and resting screen. If the assistant has been started (`hasStarted=true`), tapping the orb toggles listening. If not yet started, tapping calls `onStart`.

### ListeningState
[components/voice-ui/ListeningState.tsx](../../components/voice-ui/ListeningState.tsx)

Props: `transcription`, `isDark`, `onStopListening`

Displays the live transcription text and a waveform animation. Provides a tap-to-stop button.

### ProcessingState
[components/voice-ui/ProcessingState.tsx](../../components/voice-ui/ProcessingState.tsx)

Props: `isDark`

Simple loading indicator while GPT-4o is processing the request.

### RespondingState
[components/voice-ui/RespondingState.tsx](../../components/voice-ui/RespondingState.tsx)

Props: `responseText`, `isDark`, `onToggleListening`

Shows the AI's text response while TTS plays it. After playback completes, the user can tap to respond.

### UrgentResponseState
[components/voice-ui/UrgentResponseState.tsx](../../components/voice-ui/UrgentResponseState.tsx)

Props: `responseText`, `isDark`, `onToggleListening`

Visual variant of `RespondingState` with urgent/emergency styling. Active only when `urgency === 'ERS'` and the assistant is speaking.

### ResolutionState
[components/voice-ui/ResolutionState.tsx](../../components/voice-ui/ResolutionState.tsx)

Props: `serviceRequest`, `isDark`, `onGeneratePDF`, `onStartNew`

Shown after the service request is confirmed and submitted. Displays a summary and offers to generate the PDF work order.

### PDFGeneratingState
[components/voice-ui/PDFGeneratingState.tsx](../../components/voice-ui/PDFGeneratingState.tsx)

Props: `isDark`

Loading screen shown while `pdfService.generateServiceRequestPDF()` is running.

### PDFReadyState
[components/voice-ui/PDFReadyState.tsx](../../components/voice-ui/PDFReadyState.tsx)

Props: `isDark`, `onDownload`, `onStartNew`

Shown when the PDF is ready. Provides a download button and a "start new request" option.

## Design System Reference

These components were originally derived from a Figma export in `figma-export/`. The production versions in `components/voice-ui/` are custom implementations — they do not import from `figma-export/`.

The Figma source documents are in `figma-export/VOICE_CHAT_IMPLEMENTATION.md` and `figma-export/guidelines/Guidelines.md`.
