import { Icon, type IconName } from '../components/Sheet'

export interface PickedFile {
  blob: Blob
  name: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Camera photos arrive with meaningless names ("1732451234.jpg"); give them a readable one. */
function cameraName(file: File, index: number): string {
  const d = new Date()
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.jpg'
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `Photo_${stamp}${index ? `_${index + 1}` : ''}${ext}`
}

/** Camera / Photos / Files buttons. Calls onFiles with whatever was picked. */
export function UploadButtons({ onFiles, disabled }: { onFiles: (files: PickedFile[]) => void; disabled?: boolean }) {
  function handle(input: HTMLInputElement, fromCamera: boolean) {
    const list = Array.from(input.files ?? [])
    input.value = '' // allow picking the same file again
    if (list.length) onFiles(list.map((f, i) => ({ blob: f, name: fromCamera ? cameraName(f, i) : f.name })))
  }

  // A <label> around a hidden file input opens the phone's picker when tapped.
  const btn = (icon: IconName, label: string, input: { accept?: string; capture?: 'environment'; multiple?: boolean }) => (
    <label
      className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white active:opacity-90 ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <Icon name={icon} />
      {label}
      <input
        type="file"
        hidden
        disabled={disabled}
        {...input}
        onChange={(e) => handle(e.currentTarget, input.capture === 'environment')}
      />
    </label>
  )

  return (
    <div className="flex gap-2">
      {btn('camera', 'Camera', { accept: 'image/*', capture: 'environment' })}
      {btn('image', 'Photos', { accept: 'image/*,video/*', multiple: true })}
      {btn('file', 'Files', { multiple: true })}
    </div>
  )
}
