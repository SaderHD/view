import { createContext, useContext } from 'react'

/** Whether the sheet being rendered is the top (visible) one. */
export const SheetActiveContext = createContext(true)
export const useSheetActive = () => useContext(SheetActiveContext)
