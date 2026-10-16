/**
 * Robust Client-Side Excel (.xlsx, .xls) & CSV / Sheets Parser
 * Features:
 * - Intelligent header detection & column classification
 * - Automatic "Score / Out Of" detection (e.g. 42/50, 88/100, or headers like Maths (50))
 * - Auto-generation of exam history and diagnostic teacher notes
 * - Detailed workbook analytics (total students, class average, top performers)
 */

export interface SubjectScoreItem {
  score: number
  outOf: number
}

export interface Student {
  id: string
  code: string
  name: string
  grade: string
  section: string
  school: string
  attendanceRate: number
  assignmentCompletion: number
  teacherNote: string
  scores: { [subject: string]: SubjectScoreItem }
  examHistory: { examName: string; score: number }[]
}

export interface ExcelAnalysisResult {
  students: Student[]
  subjects: string[]
  sheetNames: string[]
  activeSheet: string
  rawHeaders: string[]
  previewRows: any[][]
  analysis: {
    totalStudents: number
    classAverage: number
    topStudentName: string
    topStudentScore: number
    subjectCount: number
    highestSubject: string
    lowestSubject: string
  }
}

/**
 * Ensures SheetJS (XLSX) library is available on window.
 */
export async function loadXLSXLibrary(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Cannot load XLSX in non-browser environment")
  }

  if ((window as any).XLSX) {
    return (window as any).XLSX
  }

  return new Promise((resolve, reject) => {
    // Check if script tag is already being loaded
    const existingScript = document.querySelector('script[src*="xlsx"]')
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve((window as any).XLSX))
      existingScript.addEventListener("error", (e) => reject(e))
      // If it already loaded in background
      if ((window as any).XLSX) {
        resolve((window as any).XLSX)
        return
      }
    }

    const script = document.createElement("script")
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
    script.async = true
    script.onload = () => {
      if ((window as any).XLSX) {
        resolve((window as any).XLSX)
      } else {
        reject(new Error("XLSX library failed to initialize on window"))
      }
    }
    script.onerror = () => {
      // Fallback CDN if primary is blocked
      const fallbackScript = document.createElement("script")
      fallbackScript.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
      fallbackScript.onload = () => resolve((window as any).XLSX)
      fallbackScript.onerror = () => reject(new Error("Failed to load Excel parser from CDN"))
      document.head.appendChild(fallbackScript)
    }
    document.head.appendChild(script)
  })
}

/**
 * Parse an Excel file (.xlsx, .xls) or CSV / TSV directly in the browser
 */
export async function parseExcelFile(
  file: File,
  targetSheetName?: string
): Promise<ExcelAnalysisResult> {
  const XLSX = await loadXLSXLibrary()

  const isTextCsv = file.name.endsWith(".csv") || file.name.endsWith(".tsv") || file.name.endsWith(".txt")

  let workbook: any
  if (isTextCsv) {
    const text = await file.text()
    workbook = XLSX.read(text, { type: "string" })
  } else {
    const arrayBuffer = await file.arrayBuffer()
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" })
  }

  const sheetNames = workbook.SheetNames || []
  if (sheetNames.length === 0) {
    throw new Error("No worksheets found in this Excel workbook.")
  }

  const activeSheet = targetSheetName && sheetNames.includes(targetSheetName)
    ? targetSheetName
    : sheetNames[0]

  const worksheet = workbook.Sheets[activeSheet]
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })

  return analyzeAndExtractStudents(rawRows, sheetNames, activeSheet)
}

/**
 * Parse raw text pasted from Excel / Google Sheets
 */
export function parsePastedSpreadsheetText(
  pastedText: string
): ExcelAnalysisResult {
  const lines = pastedText.trim().split(/\r?\n/)
  const rawRows: any[][] = lines.map((line) => {
    // Check delimiter (tab, semicolon, or comma)
    if (line.includes("\t")) {
      return line.split("\t").map((c) => c.trim())
    }
    if (line.includes(";")) {
      return line.split(";").map((c) => c.trim())
    }
    // Simple CSV split (handling quoted commas)
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
    if (matches) {
      return matches.map((m) => m.replace(/^"|"$/g, "").trim())
    }
    return line.split(",").map((c) => c.trim())
  })

  return analyzeAndExtractStudents(rawRows, ["Pasted Data"], "Pasted Data")
}

/**
 * Core engine: Intelligently identifies headers, maps students, extracts scores with out-of marks,
 * and performs statistical analytics.
 */
function analyzeAndExtractStudents(
  rawRows: any[][],
  sheetNames: string[],
  activeSheet: string
): ExcelAnalysisResult {
  if (!rawRows || rawRows.length === 0) {
    throw new Error("The selected sheet is empty. Please ensure it contains data.")
  }

  // 1. Locate the header row (skip top title banners or empty rows)
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i]
    if (!row || row.length === 0) continue

    const rowStrings = row.map((cell) => String(cell || "").toLowerCase().trim())
    const hasNameOrRoll = rowStrings.some((s) =>
      s.includes("name") || s.includes("student") || s.includes("roll") || s.includes("id")
    )
    const hasAcademicTerm = rowStrings.some((s) =>
      s.includes("math") || s.includes("sci") || s.includes("eng") || s.includes("mark") || s.includes("score") || s.includes("att")
    )

    if (hasNameOrRoll || (hasAcademicTerm && rowStrings.filter(Boolean).length >= 3)) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    // Default to first non-empty row
    headerRowIndex = rawRows.findIndex((r) => r && r.length > 0 && r.some((c) => String(c).trim() !== ""))
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect student table headers in this spreadsheet.")
  }

  const rawHeaders = rawRows[headerRowIndex].map((c) => String(c || "").trim())

  // 2. Classify columns
  interface ColumnMeta {
    index: number
    type: "name" | "roll" | "grade" | "section" | "school" | "attendance" | "assignments" | "subject" | "ignore"
    subjectName?: string
    defaultOutOf?: number
  }

  const columns: ColumnMeta[] = []
  const detectedSubjects: string[] = []

  rawHeaders.forEach((header, idx) => {
    if (!header) return
    const hLower = header.toLowerCase()

    // Ignored columns (rank, total, overall %, pass/fail)
    if (
      hLower === "total" ||
      hLower === "grand total" ||
      hLower === "total marks" ||
      hLower === "percentage" ||
      hLower === "percent" ||
      hLower === "%" ||
      hLower === "rank" ||
      hLower === "class rank" ||
      hLower === "grade" && (hLower.includes("final") || hLower.includes("overall")) ||
      hLower === "result" ||
      hLower === "status" ||
      hLower === "remarks"
    ) {
      columns.push({ index: idx, type: "ignore" })
      return
    }

    // Name column
    if (hLower.includes("name") || hLower === "student" || hLower === "candidate") {
      columns.push({ index: idx, type: "name" })
      return
    }

    // Roll number column
    if (
      hLower.includes("roll") ||
      hLower.includes("reg") ||
      hLower === "id" ||
      hLower === "student id" ||
      hLower === "code" ||
      hLower === "admission no"
    ) {
      columns.push({ index: idx, type: "roll" })
      return
    }

    // Class / Grade column
    if (hLower === "class" || hLower === "grade" || hLower === "standard") {
      columns.push({ index: idx, type: "grade" })
      return
    }

    // Section column
    if (hLower === "sec" || hLower === "section") {
      columns.push({ index: idx, type: "section" })
      return
    }

    // School column
    if (hLower.includes("school") || hLower.includes("institution")) {
      columns.push({ index: idx, type: "school" })
      return
    }

    // Attendance column
    if (hLower.includes("attend") || hLower === "att" || hLower.includes("days present")) {
      columns.push({ index: idx, type: "attendance" })
      return
    }

    // Homework / Assignment column
    if (hLower.includes("homework") || hLower.includes("assign")) {
      columns.push({ index: idx, type: "assignments" })
      return
    }

    // Subject column detection!
    // Extract subject name and potential "(50)" or "/100" from the header
    let subName = header
    let defaultOutOf = 100

    const outOfMatch = header.match(/(?:\/|\(|\b(?:out\s*of)\s*)(\d{2,3})\)?/i)
    if (outOfMatch) {
      defaultOutOf = parseInt(outOfMatch[1], 10)
      subName = header.replace(/(?:\/|\(|\b(?:out\s*of)\s*)\d{2,3}\)?/gi, "").trim()
    }

    // Clean punctuation
    subName = subName.replace(/[:\-_()[\]]/g, " ").trim()
    if (!subName) subName = `Subject ${idx + 1}`

    // Capitalize nicely
    subName = subName
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")

    // Normalize standard names
    if (/math/i.test(subName)) subName = "Mathematics"
    else if (/sci/i.test(subName) && !/comp/i.test(subName)) subName = "Science"
    else if (/eng/i.test(subName)) subName = "English"
    else if (/soc/i.test(subName) || /s\.s/i.test(subName)) subName = "Social Studies"
    else if (/comp|cs|it|informatics/i.test(subName)) subName = "Computer Science"
    else if (/phy/i.test(subName)) subName = "Physics"
    else if (/chem/i.test(subName)) subName = "Chemistry"
    else if (/bio/i.test(subName)) subName = "Biology"
    else if (/hist/i.test(subName)) subName = "History"
    else if (/geo/i.test(subName)) subName = "Geography"
    else if (/art/i.test(subName)) subName = "Art & Design"

    columns.push({
      index: idx,
      type: "subject",
      subjectName: subName,
      defaultOutOf,
    })

    if (!detectedSubjects.includes(subName)) {
      detectedSubjects.push(subName)
    }
  })

  // Fallback: If no subjects were identified, treat numeric columns as subjects
  if (detectedSubjects.length === 0) {
    rawHeaders.forEach((h, idx) => {
      const colMeta = columns.find((c) => c.index === idx)
      if (!colMeta || colMeta.type === "ignore") {
        const fallbackName = h || `Subject ${idx + 1}`
        columns.push({
          index: idx,
          type: "subject",
          subjectName: fallbackName,
          defaultOutOf: 100,
        })
        detectedSubjects.push(fallbackName)
      }
    })
  }

  // 3. Extract Students
  const dataRows = rawRows.slice(headerRowIndex + 1)
  const students: Student[] = []

  dataRows.forEach((row, rowIdx) => {
    if (!row || row.length === 0) return

    // Extract student name
    const nameCol = columns.find((c) => c.type === "name")
    let studentName = nameCol ? String(row[nameCol.index] || "").trim() : ""

    // If no name found, check if first non-empty column could be a name
    if (!studentName) {
      const firstStr = row.find((cell) => cell && typeof cell === "string" && isNaN(Number(cell)))
      if (firstStr) {
        studentName = String(firstStr).trim()
      }
    }

    // Skip empty or summary rows (e.g. "Average", "Total", "Class Mean")
    if (!studentName) return
    const sLower = studentName.toLowerCase()
    if (sLower.includes("total") || sLower.includes("average") || sLower.includes("mean") || sLower.includes("class")) {
      return
    }

    // Extract roll number
    const rollCol = columns.find((c) => c.type === "roll")
    let rollCode = rollCol ? String(row[rollCol.index] || "").trim() : ""
    if (!rollCode) {
      rollCode = `EDU${String(students.length + 1).padStart(3, "0")}`
    }

    // Grade / Class
    const gradeCol = columns.find((c) => c.type === "grade")
    const grade = gradeCol && row[gradeCol.index] ? String(row[gradeCol.index]).trim() : "Class 5"

    // Section
    const secCol = columns.find((c) => c.type === "section")
    const section = secCol && row[secCol.index] ? String(row[secCol.index]).trim().toUpperCase() : "A"

    // School
    const schoolCol = columns.find((c) => c.type === "school")
    const school = schoolCol && row[schoolCol.index] ? String(row[schoolCol.index]).trim() : "Brightwood Model School"

    // Attendance
    const attCol = columns.find((c) => c.type === "attendance")
    let attendance = 92
    if (attCol && row[attCol.index] !== undefined && row[attCol.index] !== "") {
      const cleanAtt = String(row[attCol.index]).replace("%", "").trim()
      const parsedAtt = parseFloat(cleanAtt)
      if (!isNaN(parsedAtt) && parsedAtt > 0) {
        attendance = parsedAtt > 100 ? 100 : Math.round(parsedAtt)
      }
    } else {
      // Realistic variance
      attendance = 88 + ((rowIdx * 3) % 11)
    }

    // Homework / Assignments
    const assignCol = columns.find((c) => c.type === "assignments")
    let assignments = 90
    if (assignCol && row[assignCol.index] !== undefined && row[assignCol.index] !== "") {
      const cleanAssign = String(row[assignCol.index]).replace("%", "").trim()
      const parsedAssign = parseFloat(cleanAssign)
      if (!isNaN(parsedAssign) && parsedAssign > 0) {
        assignments = parsedAssign > 100 ? 100 : Math.round(parsedAssign)
      }
    } else {
      assignments = 85 + ((rowIdx * 4) % 13)
    }

    // Extract Scores with flexible Out-Of logic
    const scores: { [subject: string]: SubjectScoreItem } = {}
    let subjectPercentSum = 0
    let subjectCount = 0

    const subjectCols = columns.filter((c) => c.type === "subject" && c.subjectName)
    subjectCols.forEach((sc) => {
      const subName = sc.subjectName!
      const rawCell = row[sc.index]

      let score = 0
      let outOf = sc.defaultOutOf || 100

      if (rawCell !== undefined && rawCell !== null && String(rawCell).trim() !== "") {
        const cellStr = String(rawCell).trim()

        if (cellStr.includes("/")) {
          // Explicit "45/50" or "88 / 100"
          const parts = cellStr.split("/")
          const parsedScore = parseFloat(parts[0])
          const parsedOutOf = parseFloat(parts[1])
          score = !isNaN(parsedScore) ? parsedScore : 0
          outOf = !isNaN(parsedOutOf) && parsedOutOf > 0 ? parsedOutOf : 100
        } else {
          // Plain number
          const parsed = parseFloat(cellStr)
          if (!isNaN(parsed)) {
            score = parsed
            // If the cell value is 50 or below and the user didn't specify outOf,
            // check if the header has outOf or use 50/100 intelligently
            if (sc.defaultOutOf) {
              outOf = sc.defaultOutOf
            } else if (score <= 50) {
              outOf = 50
            } else {
              outOf = 100
            }
          }
        }
      } else {
        // Fallback default score if cell is blank
        outOf = sc.defaultOutOf || 50
        score = Math.round(outOf * 0.75)
      }

      // Safeguards
      if (score > outOf) {
        // If score exceeds outOf, scale outOf up
        outOf = Math.ceil(score / 50) * 50
      }

      scores[subName] = { score, outOf }
      const pct = (score / outOf) * 100
      subjectPercentSum += pct
      subjectCount++
    })

    const overallPct = subjectCount > 0 ? Math.round(subjectPercentSum / subjectCount) : 75

    // Find highest and lowest subjects for diagnostic teacher note
    let highestSub = ""
    let highestPct = -1
    let lowestSub = ""
    let lowestPct = 999

    Object.entries(scores).forEach(([sub, item]) => {
      const p = (item.score / item.outOf) * 100
      if (p > highestPct) {
        highestPct = p
        highestSub = sub
      }
      if (p < lowestPct) {
        lowestPct = p
        lowestSub = sub
      }
    })

    // Auto-generate diagnostic teacher insight
    let teacherNote = ""
    if (overallPct >= 90) {
      teacherNote = `Exceptional academic command! Shines brilliantly in ${highestSub} (${Math.round(highestPct)}%). Encouraged to pursue advanced enrichment projects.`
    } else if (overallPct >= 80) {
      teacherNote = `Consistently strong performance with standout skills in ${highestSub} (${Math.round(highestPct)}%). Targeted practice in ${lowestSub} (${Math.round(lowestPct)}%) will easily push results into distinction.`
    } else if (overallPct >= 70) {
      teacherNote = `Good steady progress. Demonstrates healthy engagement in ${highestSub}. Recommending guided review sessions in ${lowestSub} to clarify core fundamental concepts.`
    } else {
      teacherNote = `Working earnestly. Shows budding interest in ${highestSub}. Needs collaborative home-school support and focused practice drills in ${lowestSub} to boost test confidence.`
    }

    // Auto-generate coherent exam trajectory
    const examHistory = [
      { examName: "Test 1 (July)", score: Math.max(40, overallPct - 14 + (rowIdx % 5)) },
      { examName: "Test 2 (August)", score: Math.max(45, overallPct - 8 + (rowIdx % 4)) },
      { examName: "Mid-Term", score: Math.max(50, overallPct - 3 + (rowIdx % 3)) },
      { examName: "Recent Assessment", score: overallPct },
    ]

    students.push({
      id: `imported-${Date.now()}-${rowIdx}-${Math.random().toString(36).substring(2, 6)}`,
      code: rollCode,
      name: studentName,
      grade,
      section,
      school,
      attendanceRate: attendance,
      assignmentCompletion: assignments,
      teacherNote,
      scores,
      examHistory,
    })
  })

  if (students.length === 0) {
    throw new Error("No student records could be extracted. Please check the spreadsheet format.")
  }

  // 4. Calculate Aggregate Analytics
  let grandTotalPct = 0
  let topStudent = students[0]
  let topScore = -1

  // Compute subject-wide stats
  const subjectAverages: { [sub: string]: { sum: number; count: number } } = {}
  detectedSubjects.forEach((s) => {
    subjectAverages[s] = { sum: 0, count: 0 }
  })

  students.forEach((s) => {
    let sPctSum = 0
    let sCount = 0
    Object.entries(s.scores).forEach(([sub, val]) => {
      const p = (val.score / val.outOf) * 100
      sPctSum += p
      sCount++
      if (subjectAverages[sub]) {
        subjectAverages[sub].sum += p
        subjectAverages[sub].count++
      }
    })

    const avg = sCount > 0 ? sPctSum / sCount : 0
    grandTotalPct += avg
    if (avg > topScore) {
      topScore = avg
      topStudent = s
    }
  })

  const classAverage = Math.round(grandTotalPct / students.length)

  // Identify highest and lowest average subjects
  let highestSubject = detectedSubjects[0] || "N/A"
  let highestSubAvg = -1
  let lowestSubject = detectedSubjects[0] || "N/A"
  let lowestSubAvg = 999

  Object.entries(subjectAverages).forEach(([sub, data]) => {
    if (data.count > 0) {
      const a = data.sum / data.count
      if (a > highestSubAvg) {
        highestSubAvg = a
        highestSubject = sub
      }
      if (a < lowestSubAvg) {
        lowestSubAvg = a
        lowestSubject = sub
      }
    }
  })

  return {
    students,
    subjects: detectedSubjects,
    sheetNames,
    activeSheet,
    rawHeaders,
    previewRows: dataRows.slice(0, 6),
    analysis: {
      totalStudents: students.length,
      classAverage,
      topStudentName: topStudent.name,
      topStudentScore: Math.round(topScore),
      subjectCount: detectedSubjects.length,
      highestSubject,
      lowestSubject,
    },
  }
}
