import { useI18n } from '../i18n'

interface FolderListProps {
  folderPath: string | null
  files: string[]
  fileLabels?: string[]
  selectedIndex: number
  saved: Set<string>
  onSelect: (index: number) => void
  onOpenFolder: () => void
}

export function FolderList({
  folderPath,
  files,
  fileLabels,
  selectedIndex,
  saved,
  onSelect,
  onOpenFolder,
}: FolderListProps) {
  const { t } = useI18n()

  return (
    <aside className="panel folder-list">
      <header className="panel-header">
        <h2>{t('folder')}</h2>
        <button type="button" className="secondary compact" onClick={onOpenFolder}>
          {t('openFolder')}
        </button>
      </header>

      {folderPath ? (
        <p className="folder-path" title={folderPath}>
          {folderPath}
        </p>
      ) : (
        <p className="empty-hint">{t('openFolderHint')}</p>
      )}

      <ul className="file-list">
        {files.map((file, index) => {
          const name = fileLabels?.[index] ?? file.split(/[/\\]/).pop() ?? file
          const isSaved = saved.has(file)
          const isActive = index === selectedIndex
          return (
            <li key={file}>
              <button
                type="button"
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(index)}
              >
                <span className="file-name">{name}</span>
                <span className={`status ${isSaved ? 'done' : 'todo'}`}>
                  {isSaved ? t('statusDone') : t('statusTodo')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {files.length > 0 && (
        <footer className="nav-row">
          <button
            type="button"
            className="secondary compact"
            disabled={selectedIndex <= 0}
            onClick={() => onSelect(selectedIndex - 1)}
          >
            {t('prev')}
          </button>
          <span className="nav-count">
            {selectedIndex + 1} / {files.length}
          </span>
          <button
            type="button"
            className="secondary compact"
            disabled={selectedIndex >= files.length - 1}
            onClick={() => onSelect(selectedIndex + 1)}
          >
            {t('next')}
          </button>
        </footer>
      )}
      {files.length > 0 && <p className="shortcut-hint">{t('shortcuts')}</p>}
    </aside>
  )
}
