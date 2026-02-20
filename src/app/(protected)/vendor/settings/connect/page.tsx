'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { connectDistributor } from '../../actions'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ConnectDistributorPage() {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    async function handleConnect(formData: FormData) {
        setIsLoading(true)
        try {
            const result = await connectDistributor(formData)
            if (result.success) {
                toast.success(result.message || "Connected successfully")
                router.push('/vendor')
                router.refresh()
            } else {
                toast.error(result.message || "Failed to connect")
            }
        } catch (error: any) {
            toast.error(error.message || "Something went wrong")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex justify-center items-start pt-12 min-h-[60vh]">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Connect to a Distributor</CardTitle>
                    <CardDescription>
                        Enter the unique code provided by your distributor to access their catalog.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleConnect} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="code" className="text-sm font-medium">Distributor Code</label>
                            <Input
                                id="code"
                                name="code"
                                placeholder="e.g. DIST-AB12CD34"
                                required
                                className="uppercase font-mono"
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Connect
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
