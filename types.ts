
export interface GroundingSource {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  data?: ParsedResponseItem[] | VehicleInspectionStep | WellnessTechnique[] | ServiceRequest | string;
  groundingSources?: GroundingSource[];
  timestamp: Date;
}

export enum AssistantTask {
  GENERAL_ASSISTANCE = 'GENERAL_ASSISTANCE',
  WEATHER = 'WEATHER',
  TRAFFIC = 'TRAFFIC',
  NEWS = 'NEWS',
  PET_FRIENDLY_REST_STOPS = 'PET_FRIENDLY_REST_STOPS',
  WORKOUT_LOCATIONS = 'WORKOUT_LOCATIONS',
  PERSONAL_WELLNESS = 'PERSONAL_WELLNESS',
  SAFE_PARKING = 'SAFE_PARKING',
  VEHICLE_INSPECTION = 'VEHICLE_INSPECTION',
  MENTAL_WELLNESS_STRESS_REDUCTION = 'MENTAL_WELLNESS_STRESS_REDUCTION',
  SERVICE_REQUEST = 'SERVICE_REQUEST',
}

export interface ParsedResponseItem {
  name: string;
  [key: string]: any; 
}

export interface RestStop extends ParsedResponseItem {
  location_description: string;
  amenities: string[];
}

export interface WorkoutLocation extends ParsedResponseItem {
  type: string;
  details: string;
}

export interface ParkingSpot extends ParsedResponseItem {
  location: string;
  security_features: string[];
  availability: string;
}

export interface VehicleInspectionStep {
  current_step_description: string;
  next_prompt?: string; // Prompt for user, e.g., "What do you see?" or "Is this item okay?"
  is_final_step?: boolean;
}

export interface WellnessTechnique {
  name: string;
  description: string;
  suitable_for: 'driving' | 'parked' | 'any';
}

export interface MoodEntry {
  timestamp: Date;
  mood_rating?: number; // e.g., 1-5
  stress_level?: number; // e.g., 1-5
  notes?: string; // Optional free-form notes from user's response
}

// User Roles
export type UserRole = 'fleet' | 'provider';

// Service Request Status (9-state lifecycle)
export type ServiceRequestStatus =
  | 'draft'              // Fleet user still filling in via conversation
  | 'submitted'          // Fleet user confirmed, visible to providers
  | 'accepted'           // Provider accepted as-is
  | 'rejected'           // Provider declined
  | 'counter_proposed'   // Provider proposed different date/time
  | 'counter_approved'   // Fleet user approved the counter-proposal
  | 'counter_rejected'   // Fleet user rejected the counter-proposal
  | 'completed'          // Work is done
  | 'cancelled';         // Fleet user cancelled

// Counter Proposal (provider proposes different schedule)
export interface CounterProposal {
  id: string;
  service_request_id: string;
  provider_id: string;
  provider_name: string;
  proposed_date: string;
  proposed_time: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  responded_at?: string;
}

// Service Coordination Types
export enum ServiceType {
  TIRE = 'TIRE',
  MECHANICAL = 'MECHANICAL',
}

export enum TireServiceType {
  REPLACE = 'REPLACE',
  REPAIR = 'REPAIR',
}

export interface TireServiceInfo {
  requested_service: TireServiceType;
  requested_tire: string;       // size/brand e.g. "295/75R22.5"
  number_of_tires: number;
  tire_position: string;        // e.g. "left front steer", "right rear drive"
}

export interface MechanicalServiceInfo {
  requested_service: string;    // e.g. "engine repair", "brake service"
  description: string;          // detailed problem description
}

export enum VehicleType {
  TRUCK = 'TRUCK',
  TRAILER = 'TRAILER'
}

export enum ServiceUrgency {
  ERS = 'ERS',           // Emergency Road Service - TODAY/SAME-DAY
  DELAYED = 'DELAYED',   // Tomorrow/next day
  SCHEDULED = 'SCHEDULED' // 2+ days out, future appointments
}

export interface VehicleInfo {
  vehicle_type: VehicleType;
}

export interface LocationInfo {
  current_location?: string;
  highway_or_road?: string;
  nearest_mile_marker?: string;
  is_safe_location?: boolean;
}

export interface ScheduledAppointmentInfo {
  scheduled_date: string;       // e.g., "2025-02-15" or "Next Monday"
  scheduled_time: string;       // e.g., "10:00 AM" or "Morning"
}

export interface ServiceRequest {
  id: string;
  timestamp: Date;

  // Contact
  driver_name: string;
  contact_phone: string;
  fleet_name: string;

  // Service details
  service_type: ServiceType;
  urgency: ServiceUrgency;

  // Location & vehicle
  location: LocationInfo;
  vehicle: VehicleInfo;

  // Service-type-specific info
  tire_info?: TireServiceInfo;
  mechanical_info?: MechanicalServiceInfo;

  // Scheduled appointment (only for SCHEDULED urgency)
  scheduled_appointment?: ScheduledAppointmentInfo;

  // Status & workflow
  status: ServiceRequestStatus;
  conversation_transcript?: string;

  // Provider workflow
  assigned_provider_id?: string;
  assigned_provider_name?: string;
  counter_proposals?: CounterProposal[];
  created_by_id?: string;
  submitted_at?: string;
  accepted_at?: string;
  completed_at?: string;

  // Scheduling workflow (proposal negotiation)
  proposed_date?: string;           // Currently active proposed date/time (ISO 8601)
  proposal_history?: ProposalEntry[]; // Audit log of all proposals
  last_updated_by?: string;         // User ID of whoever last changed the status
  last_updated_by_name?: string;    // Display name resolved from users table
  last_updated_by_role?: string;    // 'fleet' | 'provider' resolved from users table
  decline_reason?: string;          // Reason given when provider declines
}

export interface ProposalEntry {
  proposed_by: 'fleet_user' | 'service_provider';
  proposed_at: string;   // ISO 8601 timestamp
  proposed_date: string;  // ISO 8601 timestamp
  notes?: string;
}

export interface ActiveModalInfo {
  type: 'parkingConfirmation' | 'inspectionItemDetail' | 'settings';
  data: ParkingSpot | VehicleInspectionStep | UserProfile | null;
}

// User Profile and Settings
export interface VoiceOutputSettings {
  enabled: boolean;
  rate: number; // 0.1 to 10
  pitch: number; // 0 to 2
  volume: number; // 0 to 1
  voiceURI: string | null; // This now holds the Gemini Voice Name (e.g. 'Charon')
}

export interface VoiceInputSettings {
  language: string; // e.g., 'en-US'
}

export interface UserProfile {
  userName?: string; // The driver's name or handle
  voiceOutput: VoiceOutputSettings;
  voiceInput: VoiceInputSettings;
  moodHistory: MoodEntry[];
  serviceRequests: ServiceRequest[]; // Service coordination history
}
