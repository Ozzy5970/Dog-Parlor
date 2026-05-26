import React from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

// 1. PageHeader
interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 mb-8 gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 font-sans">{title}</h1>
        {description && <p className="text-slate-500 mt-1 text-sm font-sans font-medium">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// 2. SectionCard
interface SectionCardProps {
  title?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

export function SectionCard({ title, icon, children, className = '', headerAction }: SectionCardProps) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${className}`}>
      {title && (
        <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {icon && <div className="text-slate-500 flex items-center shrink-0">{icon}</div>}
            <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase">{title}</h2>
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}

// 3. StatusBadge
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'success' | 'danger' | 'warning'
  label: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    inactive: 'bg-slate-50 text-slate-500 border-slate-200/80',
    pending: 'bg-amber-50 text-amber-700 border-amber-200/80',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
    danger: 'bg-red-50 text-red-700 border-red-200/80',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${styles[status]}`}>
      {label}
    </span>
  )
}

// 4. EmptyState
interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
      {icon && <div className="mx-auto text-slate-400 mb-4 flex justify-center">{icon}</div>}
      <p className="font-bold text-slate-700 text-base">{title}</p>
      <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto leading-relaxed font-medium">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// 5. LoadingState
interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Loading details...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px]">
      <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
      <p className="text-slate-500 mt-4 text-sm font-medium">{message}</p>
    </div>
  )
}

// 6. AlertMessage
interface AlertMessageProps {
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  className?: string
}

export function AlertMessage({ type, message, className = '' }: AlertMessageProps) {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
    error: <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
    info: <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
  }

  return (
    <div className={`p-4 border rounded-xl text-sm font-medium flex items-start space-x-3 animate-fadeIn ${styles[type]} ${className}`}>
      {icons[type]}
      <span className="leading-normal">{message}</span>
    </div>
  )
}

// 7. FormField
interface FormFieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  children: React.ReactNode
  optionalText?: string
}

export function FormField({ label, htmlFor, required, error, children, optionalText }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
          {optionalText && <span className="text-slate-400 font-normal normal-case">({optionalText})</span>}
        </label>
      </div>
      {children}
      {error && <p className="text-xs text-red-600 font-semibold mt-1">{error}</p>}
    </div>
  )
}
