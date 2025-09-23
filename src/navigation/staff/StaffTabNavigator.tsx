import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import MyShiftScreen from '@/app/staff/MyShiftScreen';
import SubmitShiftScreen from '@/app/staff/SubmitShiftScreen';
import StaffSettingsScreen from '@/app/staff/StaffSettingsScreen';

const Tab = createBottomTabNavigator();

type StaffTabNavigatorProps = {
  onRequestJoin: () => void;
  isStoreSelected: boolean;
  hasStoreRoles: boolean;
  canSwitchToAdmin?: boolean;
  onSwitchToAdmin?: () => void;
};

const StaffTabNavigator: React.FC<StaffTabNavigatorProps> = ({
  onRequestJoin,
  isStoreSelected,
  hasStoreRoles,
  canSwitchToAdmin = false,
  onSwitchToAdmin,
}) => {
  const initialRouteName = hasStoreRoles ? 'StaffMyShift' : 'StaffSettings';

  return (
    <Tab.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="StaffMyShift" options={{ title: 'My shifts' }}>
        {() => (
          <MyShiftScreen
            onRequestJoin={onRequestJoin}
            isStoreSelected={isStoreSelected}
            hasStoreRoles={hasStoreRoles}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="StaffSubmit" options={{ title: 'Submit shifts' }}>
        {() => (
          <SubmitShiftScreen
            onRequestJoin={onRequestJoin}
            isStoreSelected={isStoreSelected}
            hasStoreRoles={hasStoreRoles}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="StaffSettings" options={{ title: 'Settings' }}>
        {() => (
          <StaffSettingsScreen
            onRequestJoin={onRequestJoin}
            canSwitchToAdmin={canSwitchToAdmin}
            onSwitchToAdmin={onSwitchToAdmin}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export default StaffTabNavigator;

