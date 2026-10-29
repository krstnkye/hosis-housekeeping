// PDF and Excel exports for the Housekeeping lists. The libraries load
// only when someone exports, so normal page loads stay small.

function stamp() {
  return new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export async function exportPdf({ title, fileName, columns, rows }) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
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
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const data = [
    [{ value: `Grand Horizon Hotel - ${title}`, fontWeight: 'bold' }],
    [{ value: `Generated ${stamp()}` }],
    [],
    columns.map((c) => ({ value: c.title, fontWeight: 'bold' })),
    ...rows.map((r) => columns.map((c) => ({ value: String(c.value(r) ?? '') }))),
  ]
  await writeXlsxFile(data, { columns: columns.map(() => ({ width: 22 })) }).toFile(`${fileName}.xlsx`)
}
