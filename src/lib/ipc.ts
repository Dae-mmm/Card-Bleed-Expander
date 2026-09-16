/** @deprecated Use localFiles — kept as thin re-exports for existing imports. */
export {
  chooseOutputFolder,
  detectCorners,
  fileName,
  getOutputLabel,
  hasOutputFolder,
  openFolder,
  processPreview,
  readMeta as readImageMeta,
  readOriginal as readOriginalDataUrl,
  revokeUrl,
  saveCard as saveImage,
  supportsDirectoryPicker,
  type LocalCard,
  type OpenFolderResult,
  type SaveResult,
} from './localFiles'
