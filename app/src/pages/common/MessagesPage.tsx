import { useState, useRef, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Send, Search, MessageSquare, ArrowLeft, Check, CheckCheck, Paperclip, X, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useConversations,
  useMessageThread,
  useSendMessage,
  useMarkRead,
} from '@/hooks/useMessages'
import { useT } from '@/i18n/LanguageContext'
import { useCreatePersonalTodo } from '@/hooks/usePersonalTodos'
import { Flag } from 'lucide-react'

export function MessagesPage() {
  const t = useT()
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const { data: conversations = [], isLoading: convLoading } = useConversations()
  const sendMessage = useSendMessage()
  const markRead = useMarkRead()
  const createTodo = useCreatePersonalTodo()

  // Right-click "add to To-do" context menu
  const [flagMenu, setFlagMenu] = useState<{ x: number; y: number; content: string; msgId: string } | null>(null)
  useEffect(() => {
    if (!flagMenu) return
    const close = () => setFlagMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [flagMenu])

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: messages = [], isLoading: messagesLoading } = useMessageThread(selectedPartnerId)

  // Mark as read when opening a conversation
  useEffect(() => {
    if (selectedPartnerId) {
      markRead.mutate(selectedPartnerId)
    }
  }, [selectedPartnerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const otherProfiles = profiles.filter((p) => p.id !== user?.id)

  // Conversation list with partner info
  const conversationList = useMemo(() => {
    return conversations.map((msg) => {
      const partnerId = msg.senderId === user?.id ? msg.receiverId : msg.senderId
      const partner = profiles.find((p) => p.id === partnerId)
      const isUnread = msg.receiverId === user?.id && !msg.read
      return { ...msg, partnerId, partner, isUnread }
    })
  }, [conversations, profiles, user])

  // Filter available contacts for new chat
  const filteredContacts = useMemo(() => {
    if (!search) return otherProfiles
    const q = search.toLowerCase()
    return otherProfiles.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q),
    )
  }, [otherProfiles, search])

  const handleSend = () => {
    const text = messageText.trim()
    if ((!text && !attachedFile) || !selectedPartnerId || sendMessage.isPending) return
    const file = attachedFile || undefined
    setMessageText('')
    setAttachedFile(null)
    setAttachPreview(null)
    sendMessage.mutate({ receiverId: selectedPartnerId, content: text || (file ? `📎 ${file.name}` : ''), file })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하만 가능합니다.')
      return
    }
    setAttachedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => setAttachPreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setAttachPreview(null)
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const clearAttachment = () => {
    setAttachedFile(null)
    setAttachPreview(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const selectedPartner = profiles.find((p) => p.id === selectedPartnerId)

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) {
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }
    if (diffDays === 1) return t('msg.yesterday')
    if (diffDays < 7) return `${diffDays}${t('msg.daysAgo')}`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('msg.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('msg.subtitle')}</p>
        </div>
      </div>

      <Card className="h-[calc(100%-3.5rem)] overflow-hidden">
        <div className="flex h-full">
          {/* Left panel: Conversations */}
          <div
            className={`w-full sm:w-80 border-r border-gray-100 flex flex-col ${
              selectedPartnerId ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {/* Search + New */}
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder={t('msg.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Button
                  size="sm"
                  variant={showNewChat ? 'default' : 'outline'}
                  onClick={() => setShowNewChat(!showNewChat)}
                  className="shrink-0"
                >
                  <MessageSquare className="size-4" />
                </Button>
              </div>
            </div>

            {/* Contact list (new chat mode) or conversation list */}
            <div className="flex-1 overflow-y-auto">
              {showNewChat ? (
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-400 uppercase px-2 py-1 mb-1">
                    {t('msg.team')}
                  </div>
                  {filteredContacts.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => {
                        setSelectedPartnerId(profile.id)
                        setShowNewChat(false)
                        setSearch('')
                      }}
                      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <Avatar className="h-9 w-9">
                        {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} />}
                        <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                          {profile.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium truncate">{profile.name}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {profile.position || profile.role}
                          {profile.department ? ` · ${profile.department}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : convLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="size-5 animate-spin text-gray-400" />
                </div>
              ) : conversationList.length === 0 ? (
                <div className="text-center py-20 text-sm text-gray-400">
                  {t('msg.noConversations')}
                </div>
              ) : (
                <div className="p-2">
                  {conversationList.map((conv) => (
                    <button
                      key={conv.partnerId}
                      onClick={() => {
                        setSelectedPartnerId(conv.partnerId)
                        setSearch('')
                      }}
                      className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 transition-colors ${
                        selectedPartnerId === conv.partnerId
                          ? 'bg-blue-50'
                          : conv.isUnread
                            ? 'bg-amber-50/50 hover:bg-gray-50'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        {conv.partner?.avatarUrl && (
                          <AvatarImage src={conv.partner.avatarUrl} />
                        )}
                        <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                          {conv.partner?.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-sm truncate ${conv.isUnread ? 'font-bold' : 'font-medium'}`}
                          >
                            {conv.partner?.name || t('msg.unknownUser')}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {formatTime(conv.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`text-xs truncate mt-0.5 ${conv.isUnread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}
                        >
                          {conv.senderId === user?.id && (
                            <span className="text-gray-400 mr-0.5">
                              {conv.read ? (
                                <CheckCheck className="inline size-3 text-blue-400" />
                              ) : (
                                <Check className="inline size-3" />
                              )}{' '}
                            </span>
                          )}
                          {conv.content}
                        </div>
                      </div>
                      {conv.isUnread && (
                        <span className="size-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Messages */}
          <div
            className={`flex-1 flex flex-col ${
              selectedPartnerId ? 'flex' : 'hidden sm:flex'
            }`}
          >
            {selectedPartnerId ? (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <button
                    onClick={() => setSelectedPartnerId(null)}
                    className="sm:hidden text-gray-500 hover:text-gray-700"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                  <Avatar className="h-8 w-8">
                    {selectedPartner?.avatarUrl && (
                      <AvatarImage src={selectedPartner.avatarUrl} />
                    )}
                    <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                      {selectedPartner?.name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-semibold">{selectedPartner?.name}</div>
                    <div className="text-xs text-gray-400">
                      {selectedPartner?.position || selectedPartner?.role}
                    </div>
                  </div>
                </div>

                {/* Messages body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="size-5 animate-spin text-gray-400" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-20 text-sm text-gray-400">
                      {t('msg.startConversation')}
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMine = msg.senderId === user?.id
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            onContextMenu={(e) => {
                              const text = (msg.content || msg.attachmentName || '').trim()
                              if (!text) return
                              e.preventDefault()
                              setFlagMenu({ x: e.clientX, y: e.clientY, content: text, msgId: msg.id })
                            }}
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                              isMine
                                ? 'bg-blue-500 text-white rounded-br-md'
                                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                            }`}
                          >
                            {/* Attachment preview */}
                            {msg.attachmentUrl && msg.attachmentType?.startsWith('image/') && (
                              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                                <img
                                  src={msg.attachmentUrl}
                                  alt={msg.attachmentName || 'image'}
                                  className="rounded-lg max-h-48 object-cover cursor-pointer"
                                  loading="lazy"
                                />
                              </a>
                            )}
                            {msg.attachmentUrl && !msg.attachmentType?.startsWith('image/') && (
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 rounded-lg p-2 mb-1.5 ${
                                  isMine ? 'bg-blue-600/50' : 'bg-gray-50'
                                }`}
                              >
                                <FileText className="size-5 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">{msg.attachmentName}</div>
                                  {msg.attachmentSize && (
                                    <div className={`text-[10px] ${isMine ? 'text-blue-200' : 'text-gray-400'}`}>
                                      {formatFileSize(msg.attachmentSize)}
                                    </div>
                                  )}
                                </div>
                              </a>
                            )}
                            {/* Text content (hide if it's just the auto-generated file placeholder) */}
                            {msg.content && !(msg.attachmentUrl && msg.content.startsWith('📎 ')) && (
                              <div className="text-sm whitespace-pre-wrap break-words">
                                {msg.content}
                              </div>
                            )}
                            <div
                              className={`text-[10px] mt-1 flex items-center gap-1 ${
                                isMine ? 'text-blue-200 justify-end' : 'text-gray-400'
                              }`}
                            >
                              {formatTime(msg.createdAt)}
                              {isMine &&
                                (msg.read ? (
                                  <CheckCheck className="size-3 text-blue-200" />
                                ) : (
                                  <Check className="size-3" />
                                ))}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="p-3 border-t border-gray-100 bg-white space-y-2">
                  {/* Attachment preview */}
                  {attachedFile && (
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                      {attachPreview ? (
                        <img src={attachPreview} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center">
                          <FileText className="size-5 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{attachedFile.name}</div>
                        <div className="text-[10px] text-gray-400">{formatFileSize(attachedFile.size)}</div>
                      </div>
                      <button onClick={clearAttachment} className="text-gray-400 hover:text-gray-600">
                        <X className="size-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                      title={t('msg.attachFile')}
                    >
                      <Paperclip className="size-4" />
                    </Button>
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('msg.placeholder')}
                      className="flex-1"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={(!messageText.trim() && !attachedFile) || sendMessage.isPending}
                      className="shrink-0"
                    >
                      {sendMessage.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="size-12 mx-auto mb-3 text-gray-300" />
                  <div className="text-sm">{t('msg.selectConversation')}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Right-click flag → add to personal To-do */}
      {flagMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={{ top: flagMenu.y, left: flagMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            onClick={() => {
              if (user?.id) {
                createTodo.mutate({ ownerId: user.id, title: flagMenu.content, sourceMessageId: flagMenu.msgId })
              }
              setFlagMenu(null)
            }}
          >
            <Flag className="size-4 text-amber-500" />할일에 추가
          </button>
        </div>
      )}
    </div>
  )
}
