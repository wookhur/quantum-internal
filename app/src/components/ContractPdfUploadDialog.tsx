import { useState, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { extractTextFromPdf } from '@/lib/pdf-extract'
import { extractContractFields, type ExtractedContractData } from '@/lib/extract-contract-ai'
import { useCreateContractFull } from '@/hooks/useContracts'

type Step = 'upload' | 'extracting' | 'review' | 'saving' | 'done' | 'error'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContractPdfUploadDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [extractStatus, setExtractStatus] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState<ExtractedContractData>({
    contractorName: null,
    studentName: null,
    schoolName: null,
    gradeAtContract: null,
    contractDate: null,
    expiryDate: null,
    address: null,
    phone: null,
    totalAmount: null,
    currency: null,
    paymentAccount: null,
    notes: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createContract = useCreateContractFull()

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setExtractStatus('')
    setErrorMessage('')
    setForm({
      contractorName: null, studentName: null, schoolName: null,
      gradeAtContract: null, contractDate: null, expiryDate: null,
      address: null, phone: null, totalAmount: null,
      currency: null, paymentAccount: null, notes: null,
    })
  }, [])

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) reset()
    onOpenChange(isOpen)
  }, [onOpenChange, reset])

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('PDF 파일만 업로드할 수 있습니다.')
      setStep('error')
      return
    }

    setFileName(file.name)
    setStep('extracting')

    try {
      // Step 1: Extract text from PDF
      setExtractStatus('PDF에서 텍스트 추출 중...')
      const text = await extractTextFromPdf(file)

      if (text.trim().length < 30) {
        throw new Error('PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF일 수 있습니다.')
      }

      // Step 2: AI extraction
      setExtractStatus('AI로 계약 정보 분석 중...')
      const extracted = await extractContractFields(text)

      setForm(extracted)
      setStep('review')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setStep('error')
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleSave = useCallback(() => {
    if (!form.contractorName || !form.studentName || !form.schoolName || !form.contractDate || !form.expiryDate) return

    setStep('saving')
    createContract.mutate({
      contractorName: form.contractorName,
      studentName: form.studentName,
      schoolName: form.schoolName,
      gradeAtContract: form.gradeAtContract || '',
      contractDate: form.contractDate,
      expiryDate: form.expiryDate,
      address: form.address || undefined,
      phone: form.phone || undefined,
      totalAmount: form.totalAmount || undefined,
      currency: form.currency || undefined,
      paymentAccount: form.paymentAccount || undefined,
      notes: form.notes || undefined,
    }, {
      onSuccess: () => {
        setStep('done')
        setTimeout(() => handleClose(false), 1500)
      },
      onError: (err) => {
        setErrorMessage(err instanceof Error ? err.message : '저장 실패')
        setStep('error')
      },
    })
  }, [form, createContract, handleClose])

  const updateField = <K extends keyof ExtractedContractData>(
    key: K,
    value: ExtractedContractData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isRequiredMissing = !form.contractorName || !form.studentName || !form.schoolName || !form.contractDate || !form.expiryDate

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'review' ? 'max-w-2xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && '계약서 PDF 업로드'}
            {step === 'extracting' && '계약서 분석 중'}
            {step === 'review' && '추출된 계약 정보 확인'}
            {step === 'saving' && '저장 중...'}
            {step === 'done' && '완료'}
            {step === 'error' && '오류'}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">
              계약서 PDF를 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-xs text-muted-foreground">
              PDF 파일만 지원됩니다
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Step: Extracting */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">{extractStatus}</p>
              <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <FileText className="size-4 shrink-0" />
              <span>{fileName} — AI가 추출한 정보를 확인하고 수정하세요</span>
            </div>

            {/* Required fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  계약자(학부모)명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.contractorName || ''}
                  onChange={(e) => updateField('contractorName', e.target.value || null)}
                  className={!form.contractorName ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  학생명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.studentName || ''}
                  onChange={(e) => updateField('studentName', e.target.value || null)}
                  className={!form.studentName ? 'border-destructive' : ''}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  학교명 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.schoolName || ''}
                  onChange={(e) => updateField('schoolName', e.target.value || null)}
                  className={!form.schoolName ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">학년</Label>
                <Input
                  value={form.gradeAtContract || ''}
                  onChange={(e) => updateField('gradeAtContract', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  계약일 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.contractDate || ''}
                  onChange={(e) => updateField('contractDate', e.target.value || null)}
                  className={!form.contractDate ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  만료일 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.expiryDate || ''}
                  onChange={(e) => updateField('expiryDate', e.target.value || null)}
                  className={!form.expiryDate ? 'border-destructive' : ''}
                />
              </div>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">연락처</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value || null)}
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">주소</Label>
                <Input
                  value={form.address || ''}
                  onChange={(e) => updateField('address', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">계약 금액</Label>
                <Input
                  type="number"
                  value={form.totalAmount ?? ''}
                  onChange={(e) =>
                    updateField('totalAmount', e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">통화</Label>
                <Select
                  value={form.currency || ''}
                  onValueChange={(v) => updateField('currency', (v as 'KRW' | 'USD') || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KRW">KRW (원)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">입금 계좌</Label>
                <Select
                  value={form.paymentAccount || ''}
                  onValueChange={(v) => updateField('paymentAccount', (v as 'KR' | 'US') || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KR">한국 계좌</SelectItem>
                    <SelectItem value="US">미국 계좌</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">메모/특이사항</Label>
              <Textarea
                value={form.notes || ''}
                onChange={(e) => updateField('notes', e.target.value || null)}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isRequiredMissing}
              >
                계약 저장
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">계약 정보를 저장하는 중...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <CheckCircle2 className="size-10 text-emerald-500" />
            <p className="text-sm font-medium">계약이 성공적으로 저장되었습니다!</p>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-center text-destructive">{errorMessage}</p>
            <Button variant="outline" onClick={reset}>
              다시 시도
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
