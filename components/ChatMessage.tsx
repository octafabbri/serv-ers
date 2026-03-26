import React from 'react';
import { Message, ParsedResponseItem, ParkingSpot, RestStop, WorkoutLocation, VehicleInspectionStep, WellnessTechnique, ServiceRequest } from '../types';
import { generateServiceRequestPDF, downloadPDF } from '../services/pdfService';

interface ChatMessageProps {
  message: Message;
  onBookParking?: (spot: ParkingSpot) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onBookParking }) => {
  const isUser = message.sender === 'user';
  const BubbleColors = isUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200';
  const Alignment = isUser ? 'items-end' : 'items-start';

  const renderData = (data: ParsedResponseItem[] | VehicleInspectionStep | WellnessTechnique[] | ServiceRequest | string) => {
    console.log('🎨 ChatMessage renderData called with:', {
      dataType: typeof data,
      isObject: typeof data === 'object',
      hasServiceType: data && typeof data === 'object' && 'service_type' in data,
      hasUrgency: data && typeof data === 'object' && 'urgency' in data,
      data: data
    });

    // Handle ServiceRequest data - show summary and download button
    if (data && typeof data === 'object' && 'service_type' in data && 'urgency' in data) {
      console.log('✅ ServiceRequest detected! Rendering PDF download button');
      const request = data as ServiceRequest;

      return (
        <div className="mt-2 p-3 bg-gray-700 rounded-lg">
          <h4 className="font-semibold text-blue-300 mb-2">
            <i className="fa-solid fa-file-lines mr-2"></i>
            Work Order Ready
          </h4>

          <div className="text-sm text-gray-300 space-y-1 mb-3">
            <p><strong>Service:</strong> {request.service_type.replace(/_/g, ' ')}</p>
            <p>
              <strong>Urgency:</strong>{' '}
              <span className={
                request.urgency === 'ERS' ? 'text-red-400 font-bold' :
                request.urgency === 'DELAYED' ? 'text-orange-400' : 'text-green-400'
              }>
                {request.urgency}
              </span>
            </p>
            <p><strong>Vehicle:</strong> {request.vehicle.vehicle_type}</p>
            <p><strong>Location:</strong> {request.location.current_location || 'Unknown'}</p>
            <p><strong>ID:</strong> <span className="font-mono text-xs">{request.id.slice(0, 13)}</span></p>
          </div>

          <button
            onClick={async () => {
              try {
                const blob = await generateServiceRequestPDF(request);
                const filename = `work-order-${request.urgency}-${request.id.slice(0, 8)}.pdf`;
                downloadPDF(blob, filename);
              } catch (error) {
                console.error('PDF generation failed:', error);
                alert('Failed to generate PDF. Please try again.');
              }
            }}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <i className="fa-solid fa-download mr-2"></i>
            Download Work Order PDF
          </button>
        </div>
      );
    }

    if (typeof data === 'string') return <p className="whitespace-pre-wrap">{data}</p>;
    
    if (Array.isArray(data)) { 
      // Check if the first item has a 'suitable_for' property to identify WellnessTechnique[]
      if (data.length > 0 && 'suitable_for' in data[0]) {
        const techniques = data as WellnessTechnique[];
        return techniques.map((technique, index) => (
          <div key={index} className="mt-2 p-3 bg-gray-600 rounded-lg shadow">
            <h4 className="font-semibold text-lg text-blue-300">{technique.name}</h4>
            <p className="text-sm text-gray-300 my-1">{technique.description}</p>
            <p className="text-xs text-yellow-400">
              Suitable for: <span className="font-medium">
                {technique.suitable_for === 'driving' ? 'While Driving' :
                 technique.suitable_for === 'parked' ? 'When Parked/Pulled Over' :
                 'Anytime'}
              </span>
            </p>
          </div>
        ));
      }

      // Handle ParsedResponseItem[] (existing logic)
      const items = data as ParsedResponseItem[];
      return items.map((item, index) => (
        <div key={index} className="mt-2 p-3 bg-gray-600 rounded-lg shadow">
          <h4 className="font-semibold text-lg text-blue-300">{item.name}</h4>
          { (item as RestStop).location_description && <p className="text-sm text-gray-300">Location: {(item as RestStop).location_description}</p> }
          { (item as RestStop).amenities && <p className="text-sm text-gray-300">Amenities: {(item as RestStop).amenities.join(', ')}</p> }
          { (item as WorkoutLocation).type && <p className="text-sm text-gray-300">Type: {(item as WorkoutLocation).type}</p> }
          { (item as WorkoutLocation).details && <p className="text-sm text-gray-300">Details: {(item as WorkoutLocation).details}</p> }
          { (item as ParkingSpot).location && <p className="text-sm text-gray-300">Location: {(item as ParkingSpot).location}</p> }
          { (item as ParkingSpot).security_features && <p className="text-sm text-gray-300">Security: {(item as ParkingSpot).security_features.join(', ')}</p> }
          { (item as ParkingSpot).availability && <p className="text-sm text-gray-300">Availability: {(item as ParkingSpot).availability}</p> }
          { (item as ParkingSpot).location && onBookParking && (
            <button
              onClick={() => onBookParking(item as ParkingSpot)}
              className="mt-2 px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded-md"
            >
              Simulate Booking
            </button>
          )}
        </div>
      ));
    }
    // VehicleInspectionStep
    const inspectionStep = data as VehicleInspectionStep;
    return (
       <div className="mt-2 p-3 bg-gray-600 rounded-lg shadow">
          <p className="font-semibold text-blue-300">Inspection Step:</p>
          <p className="text-gray-300">{inspectionStep.current_step_description}</p>
          {inspectionStep.next_prompt && <p className="text-sm text-gray-400 mt-1 italic">{inspectionStep.next_prompt}</p>}
        </div>
    );
  };


  return (
    <div className={`flex flex-col mb-4 ${Alignment}`}>
      <div className={`max-w-xl lg:max-w-2xl px-4 py-3 rounded-xl shadow-md ${BubbleColors}`}>
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.data && renderData(message.data)}
        {message.groundingSources && message.groundingSources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-500">
            <h5 className="text-xs font-semibold text-gray-400 mb-1">Sources:</h5>
            <ul className="list-disc list-inside space-y-1">
              {message.groundingSources.map((source, index) => (
                <li key={index} className="text-xs">
                  <a 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                    aria-label={`Source: ${source.title || 'link'} (opens in new tab)`}
                  >
                    {source.title || source.uri}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
        {message.timestamp.toLocaleTimeString()}
      </p>
    </div>
  );
};

export default ChatMessage;