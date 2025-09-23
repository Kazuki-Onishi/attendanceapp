import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ReceiptsHome from '@/app/admin/receipts/ReceiptsHome';
import ReceiptEditScreen from '@/app/admin/receipts/ReceiptEditScreen';
import labels from '@/i18n/ja.json';

export type ReceiptsStackParamList = {
  ReceiptsHome: undefined;
  ReceiptEdit: { receiptId: string; storeId: string };
};

const Stack = createNativeStackNavigator<ReceiptsStackParamList>();

const ReceiptsStack: React.FC = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ReceiptsHome"
        component={ReceiptsHome}
        options={{ headerTitle: labels.receipts.listTitle }}
      />
      <Stack.Screen
        name="ReceiptEdit"
        component={ReceiptEditScreen}
        options={{ headerTitle: labels.receipts.edit.titleEdit }}
      />
    </Stack.Navigator>
  );
};

export default ReceiptsStack;
