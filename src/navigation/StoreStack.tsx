import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginStore from '@/app/store/LoginStore';
import StoreTabNavigator from '@/navigation/store/StoreTabNavigator';
import { useAppSelector } from '@/store';

export type StoreStackParamList = {
  LoginStore: undefined;
  StoreTabs: undefined;
};

const Stack = createNativeStackNavigator<StoreStackParamList>();

const StoreStack: React.FC = () => {
  const mode = useAppSelector((state) => state.storeAuth.mode);

  const isKioskSession = mode === 'kiosk';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isKioskSession ? (
        <Stack.Screen name="StoreTabs" component={StoreTabNavigator} />
      ) : (
        <Stack.Screen name="LoginStore" component={LoginStore} />
      )}
    </Stack.Navigator>
  );
};

export default StoreStack;
