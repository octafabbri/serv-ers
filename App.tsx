import React, { useState } from 'react';
import { UserRole } from './types';
import { getUserRole, setUserRole as persistUserRole, clearUserRole } from './services/userProfileService';
import { RoleSelector } from './components/RoleSelector';
import { FleetApp } from './components/fleet/FleetApp';
import { ProviderApp } from './components/provider/ProviderApp';
import { FEATURE_FLAGS } from './constants';

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

  // No role selected — show role selector (disabled: FEATURE_FLAGS.ROLE_SELECTOR_ENABLED)
  if (FEATURE_FLAGS.ROLE_SELECTOR_ENABLED && !role) {
    return <RoleSelector onRoleSelected={handleRoleSelected} />;
  }

  // Provider role (disabled: unreachable while ROLE_SELECTOR_ENABLED is false)
  if (FEATURE_FLAGS.ROLE_SELECTOR_ENABLED && role === 'provider') {
    return <ProviderApp onSwitchRole={handleSwitchRole} />;
  }

  // Fleet role — always lands here
  return <FleetApp onSwitchRole={handleSwitchRole} />;
};

export default App;
