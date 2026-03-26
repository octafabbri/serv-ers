import React from 'react';
import { UserRole } from '../types';
import { Truck, Wrench } from 'lucide-react';

interface RoleSelectorProps {
  onRoleSelected: (role: UserRole) => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ onRoleSelected }) => {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen"
      style={{ background: '#F2F2F7', padding: '24px' }}
    >
      <div className="text-center" style={{ maxWidth: '400px', width: '100%' }}>
        <h1
          style={{
            fontSize: '34px',
            fontWeight: '700',
            color: 'var(--label-primary)',
            marginBottom: '8px',
          }}
        >
          Michelin Services
        </h1>
        <p
          style={{
            fontSize: '17px',
            color: 'var(--label-secondary)',
            marginBottom: '48px',
          }}
        >
          Powered by Serv
        </p>

        {/* Fleet / Driver Card */}
        <button
          onClick={() => onRoleSelected('fleet')}
          style={{
            width: '100%',
            padding: '24px',
            marginBottom: '16px',
            borderRadius: '16px',
            border: 'none',
            background: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(0, 122, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Truck size={28} style={{ color: '#007AFF' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--label-primary)', marginBottom: '4px' }}>
              Fleet / Driver
            </div>
            <div style={{ fontSize: '15px', color: 'var(--label-secondary)' }}>
              Create service requests with voice or chat
            </div>
          </div>
        </button>

        {/* Service Provider Card */}
        <button
          onClick={() => onRoleSelected('provider')}
          style={{
            width: '100%',
            padding: '24px',
            borderRadius: '16px',
            border: 'none',
            background: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(255, 149, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Wrench size={28} style={{ color: '#FF9500' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--label-primary)', marginBottom: '4px' }}>
              Service Provider
            </div>
            <div style={{ fontSize: '15px', color: 'var(--label-secondary)' }}>
              View and manage work orders
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
