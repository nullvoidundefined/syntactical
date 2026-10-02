// Whether the device currently reports a network connection.
import { useEffect, useState } from 'react';

import NetInfo from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener(({ isConnected }) => setIsOnline(isConnected !== false)), []);
  return isOnline;
}
