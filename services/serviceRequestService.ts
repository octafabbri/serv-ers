import { ServiceRequest, UserProfile, VehicleType, ServiceType, ServiceUrgency, LocationInfo, VehicleInfo } from '../types';

/**
 * Creates a new service request in draft status with a unique ID
 */
export const createServiceRequest = (): ServiceRequest => {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    driver_name: '',
    contact_phone: '',
    fleet_name: '',
    service_type: '' as ServiceType,
    urgency: '' as ServiceUrgency,
    location: {} as LocationInfo,
    vehicle: {} as VehicleInfo,
    status: 'draft',
  };
};

/**
 * Validates that a service request has all required fields populated.
 * Validation is layered: base fields + service-type-specific + urgency-specific.
 */
export const validateServiceRequest = (request: ServiceRequest): {
  isComplete: boolean;
  missingFields: string[];
} => {
  const missingFields: string[] = [];

  // ── Base fields (always required) ──
  if (!request.driver_name || request.driver_name.trim() === '') {
    missingFields.push('driver_name');
  }
  if (!request.contact_phone || request.contact_phone.trim() === '') {
    missingFields.push('contact_phone');
  }
  if (!request.fleet_name || request.fleet_name.trim() === '') {
    missingFields.push('fleet_name');
  }
  if (!request.service_type) {
    missingFields.push('service_type');
  }
  if (!request.urgency) {
    missingFields.push('urgency');
  }
  if (!request.location?.current_location || request.location.current_location.trim() === '') {
    missingFields.push('location.current_location');
  }
  if (!request.vehicle?.vehicle_type) {
    missingFields.push('vehicle.vehicle_type');
  }

  // ── TIRE service fields ──
  if (request.service_type === 'TIRE') {
    if (!request.tire_info) {
      missingFields.push('tire_info');
    } else {
      if (!request.tire_info.requested_service) {
        missingFields.push('tire_info.requested_service');
      }
      if (!request.tire_info.requested_tire || request.tire_info.requested_tire.trim() === '') {
        missingFields.push('tire_info.requested_tire');
      }
      if (!request.tire_info.number_of_tires || request.tire_info.number_of_tires < 1) {
        missingFields.push('tire_info.number_of_tires');
      }
      if (!request.tire_info.tire_position || request.tire_info.tire_position.trim() === '') {
        missingFields.push('tire_info.tire_position');
      }
    }
  }

  // ── MECHANICAL service fields ──
  if (request.service_type === 'MECHANICAL') {
    if (!request.mechanical_info) {
      missingFields.push('mechanical_info');
    } else {
      if (!request.mechanical_info.requested_service || request.mechanical_info.requested_service.trim() === '') {
        missingFields.push('mechanical_info.requested_service');
      }
      if (!request.mechanical_info.description || request.mechanical_info.description.trim() === '') {
        missingFields.push('mechanical_info.description');
      }
    }
  }

  // ── SCHEDULED urgency fields ──
  if (request.urgency === 'SCHEDULED') {
    if (!request.scheduled_appointment) {
      missingFields.push('scheduled_appointment');
    } else {
      if (!request.scheduled_appointment.scheduled_date || request.scheduled_appointment.scheduled_date.trim() === '') {
        missingFields.push('scheduled_appointment.scheduled_date');
      }
      if (!request.scheduled_appointment.scheduled_time || request.scheduled_appointment.scheduled_time.trim() === '') {
        missingFields.push('scheduled_appointment.scheduled_time');
      }
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
};

/**
 * Adds a completed service request to the user profile
 * Follows the pattern of addMoodEntry from userProfileService.ts
 */
export const addServiceRequest = (
  profile: UserProfile,
  request: ServiceRequest
): UserProfile => {
  const updatedRequests = [...(profile.serviceRequests || []), request];
  return { ...profile, serviceRequests: updatedRequests };
};

/**
 * Updates an existing service request in the user profile
 */
export const updateServiceRequest = (
  profile: UserProfile,
  requestId: string,
  updates: Partial<ServiceRequest>
): UserProfile => {
  const updatedRequests = profile.serviceRequests.map(req =>
    req.id === requestId ? { ...req, ...updates } : req
  );
  return { ...profile, serviceRequests: updatedRequests };
};
