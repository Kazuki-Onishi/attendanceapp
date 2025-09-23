import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

import AuthBootstrapper from '@/app/AuthBootstrapper';
import Splash from '@/app/Splash';
import RootStack from '@/navigation/RootStack';
import { persistor, store } from '@/store';

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={<Splash />} persistor={persistor}>
        <AuthBootstrapper>
          <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <RootStack />
          </SafeAreaView>
        </AuthBootstrapper>
      </PersistGate>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});
