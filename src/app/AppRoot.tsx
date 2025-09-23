import React from 'react';

import Login from '@/app/Login';
import SelectMode from '@/app/SelectMode';
import SelectStore from '@/app/SelectStore';
import Splash from '@/app/Splash';
import { useAppSelector } from '@/store';

const AppRoot: React.FC = () => {
  const { user, status } = useAppSelector((state) => state.auth);
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);

  if (status === 'loading') {
    return <Splash />;
  }

  if (!user) {
    return <Login />;
  }

  if (!selectedStoreId) {
    return <SelectStore />;
  }

  return <SelectMode />;
};

export default AppRoot;
