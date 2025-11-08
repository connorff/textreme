import * as React from "react"
import { cn } from "@/lib/utils"

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const PopoverContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({
  open: false,
  setOpen: () => {},
})

const Popover = ({ open: controlledOpen, onOpenChange, children }: PopoverProps) => {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = React.useCallback(
    (newOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(newOpen)
      }
      onOpenChange?.(newOpen)
    },
    [controlledOpen, onOpenChange]
  )

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      {children}
    </PopoverContext.Provider>
  )
}

const PopoverTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { setOpen } = React.useContext(PopoverContext)
  return (
    <div
      ref={ref}
      className={cn(className)}
      onClick={() => setOpen(true)}
      {...props}
    >
      {children}
    </div>
  )
})
PopoverTrigger.displayName = "PopoverTrigger"

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, side = "bottom", align = "center", sideOffset = 4, children, ...props }, ref) => {
    const { open } = React.useContext(PopoverContext)
    
    if (!open) return null

    return (
      <div
        ref={ref}
        className={cn(
          "z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
          side === "top" && "slide-in-from-bottom-2",
          side === "bottom" && "slide-in-from-top-2",
          side === "left" && "slide-in-from-right-2",
          side === "right" && "slide-in-from-left-2",
          className
        )}
        style={{
          marginTop: side === "top" ? -sideOffset : undefined,
          marginBottom: side === "bottom" ? -sideOffset : undefined,
          marginLeft: side === "left" ? -sideOffset : undefined,
          marginRight: side === "right" ? -sideOffset : undefined,
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }

