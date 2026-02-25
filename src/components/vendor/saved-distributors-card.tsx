'use client'

import { useMemo, useState } from 'react'
import { Loader2, Trash2, Plug2, Repeat2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'

import {
  connectDistributorByCode,
  deleteVendorSavedDistributorCode,
  saveVendorSavedDistributorCode,
  switchDistributor,
  type SavedDistributorSettingsItem
} from '@/app/(protected)/vendor/actions'

interface SavedDistributorsCardProps {
  initialItems: SavedDistributorSettingsItem[]
  activeDistributorId: string | null
  featureAvailable: boolean
}

type RowAction = 'connect' | 'switch' | 'delete' | null

const CODE_REGEX = /^DIST-[A-Z0-9]{4,}$/

function normalizeCode(input: string) {
  return input.replace(/\s+/g, '').toUpperCase()
}

function sortByCreatedDesc(items: SavedDistributorSettingsItem[]) {
  return [...items].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

export function SavedDistributorsCard({
  initialItems,
  activeDistributorId,
  featureAvailable
}: SavedDistributorsCardProps) {
  const router = useRouter()

  const [items, setItems] = useState<SavedDistributorSettingsItem[]>(() => sortByCreatedDesc(initialItems))
  const [activeId, setActiveId] = useState<string | null>(activeDistributorId)
  const [distributorName, setDistributorName] = useState('')
  const [distributorCode, setDistributorCode] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState<Record<string, RowAction>>({})

  const normalizedCode = useMemo(() => normalizeCode(distributorCode), [distributorCode])

  function isRowBusy(rowId: string, action?: Exclude<RowAction, null>) {
    if (!rowBusy[rowId]) return false
    if (!action) return true
    return rowBusy[rowId] === action
  }

  function setBusy(rowId: string, action: Exclude<RowAction, null>) {
    setRowBusy((prev) => ({ ...prev, [rowId]: action }))
  }

  function clearBusy(rowId: string) {
    setRowBusy((prev) => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
  }

  function updateItem(rowId: string, patch: Partial<SavedDistributorSettingsItem>) {
    setItems((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!featureAvailable) {
      toast.error('Saved distributors feature is not available yet.')
      return
    }

    const cleanName = distributorName.trim()
    if (!cleanName) {
      toast.error('Distributor name is required.')
      return
    }

    if (!CODE_REGEX.test(normalizedCode)) {
      toast.error('Distributor code must match DIST-XXXX.')
      return
    }

    setIsSaving(true)
    try {
      const result = await saveVendorSavedDistributorCode({
        distributorName: cleanName,
        distributorCode: normalizedCode
      })

      if (!result.success || !result.item) {
        toast.error(result.message || 'Failed to save distributor code.')
        return
      }

      setItems((prev) => sortByCreatedDesc([result.item, ...prev.filter((row) => row.id !== result.item.id)]))
      setDistributorName('')
      setDistributorCode('')
      toast.success('Saved')
    } catch (error) {
      console.error('Failed to save distributor code', error)
      toast.error('Failed to save distributor code.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleConnect(row: SavedDistributorSettingsItem) {
    if (!featureAvailable || isRowBusy(row.id)) return

    setBusy(row.id, 'connect')
    try {
      const result = await connectDistributorByCode(row.distributorCode)
      if (!result.success || !result.distributorId) {
        toast.error(result.message || 'Failed to connect distributor.')
        return
      }

      updateItem(row.id, {
        linked: true,
        linkedDistributorId: result.distributorId,
        linkedDistributorName: result.distributorName || row.linkedDistributorName,
        lastUsedAt: new Date().toISOString()
      })
      setActiveId(result.distributorId)

      toast.success(`Connected to ${result.distributorName || row.distributorName}`)
      router.refresh()
    } catch (error) {
      console.error('Failed to connect distributor', error)
      toast.error('Failed to connect distributor.')
    } finally {
      clearBusy(row.id)
    }
  }

  async function handleSwitch(row: SavedDistributorSettingsItem) {
    if (!featureAvailable || isRowBusy(row.id)) return

    setBusy(row.id, 'switch')
    try {
      let distributorId = row.linkedDistributorId
      let distributorName = row.linkedDistributorName || row.distributorName

      if (!distributorId) {
        const connectResult = await connectDistributorByCode(row.distributorCode)
        if (!connectResult.success || !connectResult.distributorId) {
          toast.error(connectResult.message || 'Failed to connect distributor before switching.')
          return
        }

        distributorId = connectResult.distributorId
        distributorName = connectResult.distributorName || distributorName

        updateItem(row.id, {
          linked: true,
          linkedDistributorId: distributorId,
          linkedDistributorName: distributorName,
          lastUsedAt: new Date().toISOString()
        })
      }

      const switchResult = await switchDistributor(distributorId)
      if (!switchResult.success) {
        toast.error(switchResult.message || 'Failed to switch distributor.')
        return
      }

      setActiveId(distributorId)
      updateItem(row.id, { lastUsedAt: new Date().toISOString(), linked: true, linkedDistributorId: distributorId })
      toast.success(`Switched to ${distributorName}`)
      router.refresh()
    } catch (error) {
      console.error('Failed to switch distributor', error)
      toast.error('Failed to switch distributor.')
    } finally {
      clearBusy(row.id)
    }
  }

  async function handleDelete(row: SavedDistributorSettingsItem) {
    if (!featureAvailable || isRowBusy(row.id)) return

    setBusy(row.id, 'delete')
    try {
      const result = await deleteVendorSavedDistributorCode(row.id)
      if (!result.success) {
        toast.error(result.message || 'Failed to delete saved code.')
        return
      }

      setItems((prev) => prev.filter((item) => item.id !== row.id))
      toast.success('Removed from saved list')
    } catch (error) {
      console.error('Failed to delete saved code', error)
      toast.error('Failed to delete saved code.')
    } finally {
      clearBusy(row.id)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Saved Distributors</CardTitle>
        <CardDescription>
          Store distributor names and codes for quick connect and context switching.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={distributorName}
            onChange={(e) => setDistributorName(e.target.value)}
            placeholder="Distributor Name"
            disabled={isSaving || !featureAvailable}
          />
          <Input
            value={distributorCode}
            onChange={(e) => setDistributorCode(e.target.value)}
            placeholder="DIST-XXXXXXX"
            className="font-mono"
            disabled={isSaving || !featureAvailable}
          />
          <Button type="submit" disabled={isSaving || !featureAvailable}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </form>

        {!featureAvailable && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Saved distributors table is not available yet. Apply latest database migrations.
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No saved distributors yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => {
              const busy = isRowBusy(row.id)
              const isActive = Boolean(row.linkedDistributorId && row.linkedDistributorId === activeId)

              return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.distributorName}</p>
                      <p className="font-mono text-xs text-slate-600">{row.distributorCode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.linked ? 'success' : 'warning'}>
                        {row.linked ? 'Linked' : 'Not linked'}
                      </Badge>
                      {isActive && <Badge variant="secondary">Active</Badge>}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <CopyButton text={row.distributorCode} label="Copy Code" className="w-full" />

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={busy || row.linked || !featureAvailable}
                      onClick={() => handleConnect(row)}
                    >
                      {isRowBusy(row.id, 'connect') ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : row.linked ? (
                        <Plug2 className="mr-2 h-4 w-4" />
                      ) : (
                        <Plug2 className="mr-2 h-4 w-4" />
                      )}
                      {row.linked ? 'Linked' : 'Connect'}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={busy || !featureAvailable}
                      onClick={() => handleSwitch(row)}
                    >
                      {isRowBusy(row.id, 'switch') ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Repeat2 className="mr-2 h-4 w-4" />
                      )}
                      {isActive ? 'Switch (Active)' : 'Switch'}
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      disabled={busy || !featureAvailable}
                      onClick={() => handleDelete(row)}
                    >
                      {isRowBusy(row.id, 'delete') ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
