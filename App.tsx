import React, { useState } from 'react';
import { UserRole } from './types';
import { getUserRole, setUserRole as persistUserRole, clearUserRole } from './services/userProfileService';
import { RoleSelector } from './components/RoleSelector';
import { FleetApp } from './components/fleet/FleetApp';
import { ProviderApp } from './components/provider/ProviderApp';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(getUserRole());

  const handleRoleSelected = (selectedRole: UserRole) => {
    persistUserRole(selectedRole);
    setRole(selectedRole);
  };

  const handleSwitchRole = () => {
    clearUserRole();
    setRole(null);
  };

  // No role selected — show role selector
  if (!role) {
    return <RoleSelector onRoleSelected={handleRoleSelected} />;
  }

  // Provider role
  if (role === 'provider') {
    return <ProviderApp onSwitchRole={handleSwitchRole} />;
  }

  // Fleet role
  return <FleetApp onSwitchRole={handleSwitchRole} />;
};

export default App;
