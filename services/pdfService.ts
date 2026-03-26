import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ServiceRequest } from '../types';

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  return dateStr;
}

/**
 * Generates a PDF work order from a ServiceRequest
 * Uses html2canvas to render HTML template, then converts to PDF
 */
export const generateServiceRequestPDF = async (
  request: ServiceRequest
): Promise<Blob> => {
  // Create hidden HTML element for rendering
  const container = document.createElement('div');
  container.innerHTML = renderPDFHTML(request);
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.width = '800px'; // Fixed width for consistent rendering
  document.body.appendChild(container);

  try {
    // Render HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher resolution
      backgroundColor: '#ffffff',
      logging: false,
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if content exceeds one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight; // Calculate position for next page
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Clean up
    document.body.removeChild(container);

    return pdf.output('blob');
  } catch (error) {
    // Clean up on error
    document.body.removeChild(container);
    throw error;
  }
};

/**
 * Triggers browser download of PDF blob
 */
export const downloadPDF = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Renders HTML template for PDF work order
 * Color-coded urgency banners: ERS=red, DELAYED=orange, SCHEDULED=green
 */
const renderPDFHTML = (request: ServiceRequest): string => {
  // Urgency color mapping
  const urgencyColor = request.urgency === 'ERS' ? '#ff4444'
    : request.urgency === 'DELAYED' ? '#ffaa00' : '#44ff44';

  const urgencyLabel = request.urgency === 'ERS' ? 'EMERGENCY ROAD SERVICE (TODAY/SAME-DAY)'
    : request.urgency === 'DELAYED' ? 'DELAYED SERVICE (TOMORROW)'
    : 'SCHEDULED SERVICE (2+ DAYS)';

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; background: white;">
      <div style="border: 3px solid #000; padding: 20px;">
        <!-- Header -->
        <h1 style="text-align: center; margin: 0; font-size: 24px; text-transform: uppercase;">
          ROADSIDE ASSISTANCE WORK ORDER
        </h1>
        <p style="text-align: center; font-size: 11px; margin: 5px 0; color: #666;">
          Request ID: ${request.id}
        </p>
        <p style="text-align: center; font-size: 11px; margin: 5px 0 15px 0; color: #666;">
          Generated: ${new Date(request.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </p>

        <!-- Urgency Banner -->
        <div style="background: ${urgencyColor}; color: #000; padding: 12px; margin: 15px 0; text-align: center; font-weight: bold; font-size: 16px; border: 2px solid #000;">
          URGENCY: ${urgencyLabel}
        </div>

        <!-- Driver Information -->
        <div style="margin: 15px 0; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #f0f0f0; padding: 5px;">
            DRIVER INFORMATION
          </h3>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Name:</strong> ${request.driver_name}
          </p>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Phone:</strong> ${request.contact_phone}
          </p>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Fleet:</strong> ${request.fleet_name}
          </p>
        </div>

        <!-- Location -->
        <div style="margin: 15px 0; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #f0f0f0; padding: 5px;">
            LOCATION
          </h3>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Current Location:</strong> ${request.location.current_location || 'N/A'}
          </p>
          ${request.location.highway_or_road ? `
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Highway/Road:</strong> ${request.location.highway_or_road}
            </p>
          ` : ''}
          ${request.location.nearest_mile_marker ? `
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Mile Marker:</strong> ${request.location.nearest_mile_marker}
            </p>
          ` : ''}
          ${request.location.is_safe_location !== undefined ? `
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Safe Location:</strong> ${request.location.is_safe_location ? 'Yes' : 'No'}
            </p>
          ` : ''}
        </div>

        <!-- Vehicle Information -->
        <div style="margin: 15px 0; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #f0f0f0; padding: 5px;">
            VEHICLE INFORMATION
          </h3>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Type:</strong> ${request.vehicle.vehicle_type}
          </p>
        </div>

        <!-- Service Required -->
        <div style="margin: 15px 0; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #f0f0f0; padding: 5px;">
            SERVICE REQUIRED — ${request.service_type}
          </h3>
          ${request.service_type === 'TIRE' && request.tire_info ? `
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Requested Service:</strong> ${request.tire_info.requested_service}
            </p>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Tire:</strong> ${request.tire_info.requested_tire}
            </p>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Quantity:</strong> ${request.tire_info.number_of_tires}
            </p>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Position:</strong> ${request.tire_info.tire_position}
            </p>
          ` : ''}
          ${request.service_type === 'MECHANICAL' && request.mechanical_info ? `
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Requested Service:</strong> ${request.mechanical_info.requested_service}
            </p>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Problem Description:</strong> ${request.mechanical_info.description}
            </p>
          ` : ''}
        </div>

        <!-- Scheduled Appointment (if applicable) -->
        ${request.scheduled_appointment ? `
          <div style="margin: 15px 0; border-bottom: 2px solid #000; padding-bottom: 10px;">
            <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #ffe6cc; padding: 5px;">
              SCHEDULED APPOINTMENT
            </h3>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Date:</strong> ${formatDisplayDate(request.scheduled_appointment.scheduled_date)}
            </p>
            <p style="margin: 5px 0; font-size: 13px;">
              <strong>Time:</strong> ${request.scheduled_appointment.scheduled_time}
            </p>
          </div>
        ` : ''}

        <!-- Conversation Transcript (Optional) -->
        ${request.conversation_transcript ? `
          <div style="margin-top: 20px; border-top: 2px solid #000; padding-top: 15px;">
            <h3 style="margin: 5px 0; font-size: 16px; text-transform: uppercase; background: #f0f0f0; padding: 5px;">
              CONVERSATION TRANSCRIPT
            </h3>
            <div style="background: #f9f9f9; padding: 10px; font-size: 10px; white-space: pre-wrap; font-family: monospace; border: 1px solid #ddd; line-height: 1.4;">
${request.conversation_transcript}
            </div>
          </div>
        ` : ''}

        <!-- Footer -->
        <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 10px; color: #666; text-align: center;">
          <p style="margin: 3px 0;">Generated by Serv — Michelin Services</p>
          <p style="margin: 3px 0;">For assistance, contact your dispatch or fleet manager</p>
        </div>
      </div>
    </div>
  `;
};
