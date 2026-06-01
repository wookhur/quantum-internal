import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import type { ExportFormat, ExportScope } from '@/utils/incentiveExport'

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface IncentiveExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultScope: ExportScope
  onExport: (params: { format: ExportFormat; scope: ExportScope; startMonth: string; endMonth: string }) => void
}

export function IncentiveExportDialog({ open, onOpenChange, defaultScope, onExport }: IncentiveExportDialogProps) {
  const t = useT()
  const [format, setFormat] = useState<ExportFormat>('excel')
  const [scope, setScope] = useState<ExportScope>(defaultScope)
  const [startMonth, setStartMonth] = useState<string>(getCurrentMonth())
  const [endMonth, setEndMonth] = useState<string>(getCurrentMonth())

  const handleExport = () => {
    onExport({ format, scope, startMonth, endMonth })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('incentive.export')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('incentive.exportFormat')}</Label>
            <div className="flex gap-2">
              <Button
                variant={format === 'excel' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setFormat('excel')}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Excel
              </Button>
              <Button
                variant={format === 'pdf' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setFormat('pdf')}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                PDF
              </Button>
            </div>
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('incentive.exportScope')}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ExportScope)}>
              <SelectTrigger>
                <span>{scope === 'by-contract' ? t('incentive.byContract') : t('incentive.byPerson')}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="by-contract">{t('incentive.byContract')}</SelectItem>
                <SelectItem value="by-person">{t('incentive.byPerson')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t('incentive.exportPeriod')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="flex-1"
              />
              <span className="text-muted-foreground">~</span>
              <Input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="flex-1"
              />
            </div>
            {startMonth > endMonth && (
              <p className="text-xs text-red-500">{t('incentive.exportPeriodError')}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={startMonth > endMonth}>
            <Download className="h-4 w-4 mr-1.5" />
            {t('incentive.exportDownload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
