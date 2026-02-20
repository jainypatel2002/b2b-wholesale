'use client'

import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function NotificationsBell({ userId }: { userId: string }) {
    const [notifications, setNotifications] = useState<any[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        if (!userId) return

        async function fetchNotifications() {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20)

            if (data) {
                setNotifications(data)
                setUnreadCount(data.filter(n => !n.is_read).length)
            }
        }

        fetchNotifications()

        // Optional realtime subscription
        const channel = supabase
            .channel('public:notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                setNotifications(prev => [payload.new, ...prev].slice(0, 20))
                setUnreadCount(count => count + 1)
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId, supabase])

    const markAsRead = async (id: string, ref_type?: string, ref_id?: string) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
        setUnreadCount(count => Math.max(0, count - 1))

        await supabase.from('notifications').update({ is_read: true }).eq('id', id)
        setIsOpen(false)

        if (ref_type === 'order' && ref_id) {
            // Need to route based on whether we are vendor or distributor. We can just use the path context or default.
            // A quick heuristic: if the current URL has vendor, go to vendor. Otherwise distributor.
            if (window.location.pathname.startsWith('/vendor')) {
                router.push(`/vendor/orders/${ref_id}`)
            } else {
                router.push(`/distributor/orders/${ref_id}`)
            }
        }
    }

    const markAllAsRead = async () => {
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
        if (unreadIds.length === 0) return

        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        setUnreadCount(0)

        await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
                    <Bell className="h-5 w-5 text-slate-600" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800">
                            Mark all as read
                        </button>
                    )}
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500">
                            No new notifications
                        </div>
                    ) : (
                        notifications.map(n => (
                            <div
                                key={n.id}
                                onClick={() => markAsRead(n.id, n.ref_type, n.ref_id)}
                                className={`flex flex-col gap-1 cursor-pointer border-b border-slate-50 p-4 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <h5 className={`text-sm ${!n.is_read ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                                        {n.title}
                                    </h5>
                                    {!n.is_read && <span className="h-2 w-2 mt-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                                </div>
                                {n.body && <p className="text-xs text-slate-500 line-clamp-2">{n.body}</p>}
                                <span className="text-[10px] text-slate-400 mt-1">
                                    {new Date(n.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
