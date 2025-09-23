import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import labels from '@/i18n/ja.json';
import Login from '@/app/Login';
import SignUp from '@/app/SignUp';
import SelectStore from '@/app/SelectStore';
import Splash from '@/app/Splash';
import StoreStack from '@/navigation/StoreStack';
import AdminTabNavigator from '@/navigation/admin/AdminTabNavigator';
import StaffTabNavigator from '@/navigation/staff/StaffTabNavigator';
import JoinStoreModal from '@/app/staff/JoinStoreModal';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectStaffStoreContext, type StaffStoreContextState } from '@/store/selectors/staffSelectors';
import { isAdminRole, roleForStore } from '@/utils/roles';
import { setActiveView } from '@/store/slices/appViewSlice';

enableScreens();

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  SignUp: undefined;
  SelectStore: undefined;
  StaffTabs: undefined;
  AdminTabs: undefined;
  StoreStack: undefined;
  StoreStackModal: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type StaffTabsScreenProps = NativeStackScreenProps<RootStackParamList, 'StaffTabs'> & {
  isAdmin: boolean;
  storeContext: StaffStoreContextState;
  onSwitchToAdmin: () => void;
};

const StaffTabsScreen: React.FC<StaffTabsScreenProps> = ({ navigation, isAdmin, storeContext, onSwitchToAdmin }) => {
  const [joinVisible, setJoinVisible] = useState(false);

  const staffLabels = labels.staff ?? ({} as Record<string, any>);
  const joinLabels = staffLabels.join ?? {};
  const headerTitle = staffLabels.tabTitle ?? 'Staff';
  const joinButtonLabel = joinLabels.cta ?? 'Join store';

  const { isStoreSelected, hasAvailableStore } = storeContext;

  const shouldShowJoinButton = !hasAvailableStore || !isStoreSelected;

  const handleOpenJoin = useCallback(() => {
    setJoinVisible(true);
  }, []);

  const handleCloseJoin = useCallback(() => {
    setJoinVisible(false);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle,
      headerRight: shouldShowJoinButton
        ? () => (
            <TouchableOpacity style={styles.joinButton} onPress={handleOpenJoin}>
              <Text style={styles.joinButtonLabel}>{joinButtonLabel}</Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, headerTitle, shouldShowJoinButton, handleOpenJoin, joinButtonLabel]);

  return (
    <>
      <StaffTabNavigator
        onRequestJoin={handleOpenJoin}
        isStoreSelected={isStoreSelected}
        hasStoreRoles={hasAvailableStore}
        canSwitchToAdmin={isAdmin}
        onSwitchToAdmin={onSwitchToAdmin}
      />
      <JoinStoreModal visible={joinVisible} onClose={handleCloseJoin} />
    </>
  );
};

type AdminTabsScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminTabs'> & {
  onSwitchToStaff: () => void;
};

const AdminTabsScreen: React.FC<AdminTabsScreenProps> = ({ onSwitchToStaff }) => {
  return <AdminTabNavigator onSwitchToStaff={onSwitchToStaff} />;
};

const RootStack: React.FC = () => {
  const dispatch = useAppDispatch();
  const { status, user, roles } = useAppSelector((state) => state.auth);
  const storeAuth = useAppSelector((state) => state.storeAuth);
  const staffStoreContext = useAppSelector(selectStaffStoreContext);
  const activeView = useAppSelector((state) => state.appView.activeView);

  const activeRoles = useMemo(() => roles.filter((role) => role.isResigned !== true), [roles]);

  const rolesByStore = useMemo(() => {
    const map: Record<string, string> = {};
    activeRoles.forEach((role) => {
      map[role.storeId] = role.role;
    });
    return map;
  }, [activeRoles]);

  const selectedRole = roleForStore(rolesByStore, staffStoreContext.selectedStoreId);
  const isAdmin = isAdminRole(selectedRole);
  const isAuthenticated = Boolean(user);
  const isLoading = status === 'loading';
  const isKioskSession = storeAuth.mode === 'kiosk';
  const shouldSelectStore = staffStoreContext.needsStoreSelection;

  useEffect(() => {
    if (!isAdmin && activeView === 'admin') {
      dispatch(setActiveView('staff'));
    }
  }, [dispatch, isAdmin, activeView]);

  const resolvedView = isAdmin && activeView === 'admin' ? 'admin' : 'staff';

  const handleSwitchToAdmin = useCallback(() => {
    if (isAdmin) {
      dispatch(setActiveView('admin'));
    }
  }, [dispatch, isAdmin]);

  const handleSwitchToStaff = useCallback(() => {
    dispatch(setActiveView('staff'));
  }, [dispatch]);

  return (
    <NavigationContainer>
      <Stack.Navigator key={`root-${resolvedView}`} screenOptions={{ headerShown: false }}>
        {isLoading ? (
          <Stack.Screen name="Splash" component={Splash} />
        ) : isKioskSession ? (
          <Stack.Screen name="StoreStack" component={StoreStack} />
        ) : !isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen
              name="SignUp"
              component={SignUp}
              options={{ headerShown: true, title: 'Sign up' }}
            />
          </>
        ) : shouldSelectStore ? (
          <Stack.Screen name="SelectStore" component={SelectStore} />
        ) : resolvedView === 'admin' ? (
          <Stack.Screen name="AdminTabs" options={{ headerShown: false }}>
            {(props) => <AdminTabsScreen {...props} onSwitchToStaff={handleSwitchToStaff} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="StaffTabs" options={{ headerShown: true }}>
            {(props) => (
              <StaffTabsScreen
                {...props}
                isAdmin={isAdmin}
                storeContext={staffStoreContext}
                onSwitchToAdmin={handleSwitchToAdmin}
              />
            )}
          </Stack.Screen>
        )}
        <Stack.Screen
          name="StoreStackModal"
          component={StoreStack}
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  joinButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  joinButtonLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default RootStack;
