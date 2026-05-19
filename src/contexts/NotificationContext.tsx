import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSheetData } from '../sheets/api';
import { SHEET_NAMES } from '../sheets/config';
import { PaymentRow, WorkflowStatusRow, ClientRow } from '../sheets/types';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { differenceInDays, parse, isValid } from 'date-fns';

export interface AppNotification {
  id: string;
  clientId: string;
  clientName: string;
  type: 'payment' | 'workflow';
  message: string;
  read: boolean;
  timestamp: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { user } = useAuth();
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('solar_crm_read_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const checkReminders = async () => {
      try {
        const [payments, workflowStatuses, clients] = await Promise.all([
          getSheetData<PaymentRow>(SHEET_NAMES.PAYMENTS),
          getSheetData<WorkflowStatusRow>(SHEET_NAMES.WORKFLOW_STATUS),
          getSheetData<ClientRow>(SHEET_NAMES.CLIENTS)
        ]);

        const clientMap = new Map(clients.map(c => [c.ID, c.Name]));
        const newNotifications: AppNotification[] = [];

        // Check payments
        payments.forEach(payment => {
          if (payment['Payment Status'] !== 'Paid' && payment['Due Date']) {
            const dueDate = parse(payment['Due Date'], 'dd/MM/yyyy', new Date());
            if (isValid(dueDate)) {
              const diff = differenceInDays(dueDate, new Date());
              if (diff <= 3) {
                const id = `payment-${payment['Client ID']}-${payment['Due Date']}`;
                const isRead = readNotificationIds.includes(id);
                newNotifications.push({
                  id,
                  clientId: payment['Client ID'],
                  clientName: clientMap.get(payment['Client ID']) || 'Unknown Client',
                  type: 'payment',
                  message: `Due: ₹${payment['Pending Amount (₹)']} (${diff < 0 ? 'Overdue' : `${diff}d`})`,
                  read: isRead,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        });

        // Check workflow statuses
        workflowStatuses.forEach(ws => {
          if (ws['Updated At']) {
             const updatedAt = new Date(ws['Updated At']); 
             if (!isNaN(updatedAt.getTime())) {
                const diff = differenceInDays(new Date(), updatedAt);
                if (diff > 7 && ws.Stage !== 'Project Closed') {
                  const id = `workflow-${ws['Client ID']}-${ws['Updated At']}`;
                  const isRead = readNotificationIds.includes(id);
                  newNotifications.push({
                    id,
                    clientId: ws['Client ID'],
                    clientName: clientMap.get(ws['Client ID']) || 'Unknown Client',
                    type: 'workflow',
                    message: `Stuck: ${ws.Stage} (${diff}d)`,
                    read: isRead,
                    timestamp: new Date().toISOString()
                  });
                }
             }
          }
        });

        // Simple duplicate removal based on ID
        setNotifications(prev => {
           const existingIds = new Set(prev.map(n => n.id));
           const filteredNew = newNotifications.filter(n => !existingIds.has(n.id));
           
           // Only trigger toast for notifications that are UNREAD and not already in state
           const unreadNew = filteredNew.filter(n => !n.read);
           if (unreadNew.length > 0) {
              if (unreadNew.length > 3) {
                toast(`New reminders: ${unreadNew.length}`);
              } else {
                unreadNew.forEach(n => {
                   toast(`${n.clientName}: ${n.message}`);
                });
              }
           }
           
           return [...filteredNew, ...prev].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        });

      } catch (err) {
        console.error("Failed to check reminders", err);
      }
    };

    checkReminders();
    const intervalId = setInterval(checkReminders, 60000); // Check every 60s
    return () => clearInterval(intervalId);
  }, [user, readNotificationIds]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setReadNotificationIds(prev => {
      const next = [...new Set([...prev, id])];
      localStorage.setItem('solar_crm_read_notifications', JSON.stringify(next));
      return next;
    });
  };
  
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setReadNotificationIds(prev => {
      const allIds = notifications.map(n => n.id);
      const next = [...new Set([...prev, ...allIds])];
      localStorage.setItem('solar_crm_read_notifications', JSON.stringify(next));
      return next;
    });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, markAsRead, markAllAsRead, unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
