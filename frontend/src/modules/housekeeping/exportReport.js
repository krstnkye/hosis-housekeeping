import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import writeXlsxFile from 'write-excel-file/browser'

// Bundling the report libraries with the application avoids stale
// development-server module URLs after a restart or update.

function stamp() {
  return new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function spreadsheetText(value) {
  const text = String(value ?? '')
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

export async function exportPdf({ title, fileName, columns, rows }) {
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' })
  doc.setFontSize(14)
  doc.text(`Grand Horizon Hotel - ${title}`, 14, 16)
  doc.setFontSize(9)
  doc.text(`HOSIS Housekeeping · generated ${stamp()}`, 14, 22)
  autoTable(doc, {
    startY: 27,
    head: [columns.map((c) => c.title)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ''))),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [18, 13, 92] },
  })
  doc.save(`${fileName}.pdf`)
}

export async function exportExcel({ title, fileName, columns, rows }) {
  const data = [
    [{ value: `Grand Horizon Hotel - ${title}`, fontWeight: 'bold' }],
    [{ value: `Generated ${stamp()}` }],
    [],
    columns.map((c) => ({ value: c.title, fontWeight: 'bold' })),
    ...rows.map((r) => columns.map((c) => ({ value: spreadsheetText(c.value(r)) }))),
  ]
  await writeXlsxFile(data, { columns: columns.map(() => ({ width: 22 })) }).toFile(`${fileName}.xlsx`)
}

function csvCell(value) {
  const text = spreadsheetText(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export async function exportCsv({ title, fileName, columns, rows }) {
  const lines = [
    [`Grand Horizon Hotel - ${title}`],
    [`Generated ${stamp()}`],
    [],
    columns.map((c) => c.title),
    ...rows.map((r) => columns.map((c) => c.value(r))),
  ]
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
