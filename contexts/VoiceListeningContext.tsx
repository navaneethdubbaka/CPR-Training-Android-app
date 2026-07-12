import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface VoiceListeningContextValue {
  isVoiceListening: boolean;
  setVoiceListening: (listening: boolean) => void;
}

const VoiceListeningContext = createContext<VoiceListeningContextValue>({
  isVoiceListening: false,
  setVoiceListening: () => {},
});

export function VoiceListeningProvider({ children }: { children: React.ReactNode }) {
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const setVoiceListening = useCallback((listening: boolean) => {
    setIsVoiceListening(listening);
  }, []);

  const value = useMemo(
    () => ({ isVoiceListening, setVoiceListening }),
    [isVoiceListening, setVoiceListening],
  );

  return (
    <VoiceListeningContext.Provider value={value}>
      {children}
    </VoiceListeningContext.Provider>
  );
}

export function useVoiceListening(): VoiceListeningContextValue {
  return useContext(VoiceListeningContext);
}
