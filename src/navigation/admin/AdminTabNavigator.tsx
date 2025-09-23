import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import AdminHomeScreen from '@/app/admin/home/AdminHomeScreen';
import AdminSettingsScreen from '@/app/admin/settings/AdminSettingsScreen';
import ApprovalsScreen from '@/app/admin/approvals/ApprovalsScreen';
import AdminStaffScreen from '@/app/admin/staff/AdminStaffScreen';
import ReceiptsStack from '@/navigation/admin/ReceiptsStack';
import labels from '@/i18n/ja.json';

const Tab = createBottomTabNavigator();

type PlaceholderProps = {
  title: string;
};

const PlaceholderScreen: React.FC<PlaceholderProps> = ({ title }) => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderTitle}>{title}</Text>
    <Text style={styles.placeholderText}>Content coming soon.</Text>
  </View>
);

type AdminTabNavigatorProps = {
  onSwitchToStaff: () => void;
};

const AdminTabNavigator: React.FC<AdminTabNavigatorProps> = ({ onSwitchToStaff }) => {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="AdminHome" component={AdminHomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="AdminReceipts"
        component={ReceiptsStack}
        options={{ title: labels.receipts.tabTitle }}
      />
      <Tab.Screen name="AdminApprovals" options={{ title: 'Approvals' }}>
        {() => <ApprovalsScreen />}
      </Tab.Screen>
      <Tab.Screen name="AdminStaff" options={{ title: 'Staff' }}>
        {() => <AdminStaffScreen />}
      </Tab.Screen>
      <Tab.Screen
        name="AdminShifts"
        options={{ title: 'Shifts' }}
      >
        {() => <PlaceholderScreen title="Shifts" />}
      </Tab.Screen>
      <Tab.Screen
        name="AdminPayroll"
        options={{ title: 'Attendance' }}
      >
        {() => <PlaceholderScreen title="Payroll" />}
      </Tab.Screen>
      <Tab.Screen name="AdminSettings" options={{ title: 'Settings' }}>
        {() => <AdminSettingsScreen onSwitchToStaff={onSwitchToStaff} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  placeholderText: {
    fontSize: 14,
    color: '#cbd5f5',
  },
});

export default AdminTabNavigator;
