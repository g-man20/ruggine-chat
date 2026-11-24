/**
 * Hook per mostrare notifiche globali
 * Esempio di utilizzo:
 * 
 * const notify = useNotification();
 * notify.success('Operazione completata!');
 * notify.error('Si è verificato un errore');
 * notify.warning('Attenzione!');
 * notify.info('Informazione importante');
 */

export const useNotification = () => {
  const showNotification = (message, type = 'info', duration = 3000) => {
    window.dispatchEvent(new CustomEvent('showNotification', {
      detail: {
        message,
        type,
        duration,
        id: Date.now()
      }
    }));
  };

  return {
    success: (message, duration = 3000) => showNotification(message, 'success', duration),
    error: (message, duration = 4000) => showNotification(message, 'error', duration),
    warning: (message, duration = 3500) => showNotification(message, 'warning', duration),
    info: (message, duration = 3000) => showNotification(message, 'info', duration),
    show: showNotification
  };
};
