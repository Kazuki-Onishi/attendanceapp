import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import StoreAttendance from '@/app/store/StoreAttendance';
import StoreShiftsScreen from '@/app/store/StoreShiftsScreen';
import StoreSalesScreen from '@/app/store/StoreSalesScreen';

const Tab = createBottomTabNavigator();

const StoreTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="StoreShifts"
        component={StoreShiftsScreen}
        options={{ title: 'Shifts' }}
      />
      <Tab.Screen
        name="StoreAttendance"
        component={StoreAttendance}
        options={{ title: 'Attendance' }}
      />
      <Tab.Screen
        name="StoreSales"
        component={StoreSalesScreen}
        options={{ title: 'Sales' }}
      />
    </Tab.Navigator>
  );
};

export default StoreTabNavigator;
