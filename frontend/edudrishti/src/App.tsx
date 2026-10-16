import React, { useState, useRef } from "react"
import { useSpeechSynthesis } from "./utils/speech"
import {
  parseExcelFile,
  parsePastedSpreadsheetText,
  ExcelAnalysisResult,
  loadXLSXLibrary,
} from "./utils/excelParser"

interface SubjectScoreItem {
  score: number // Marks obtained, e.g. 45
  outOf: number // Total marks, e.g. 50
}

interface Student {
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

const DEFAULT_SUBJECTS = ["Mathematics", "Science", "English", "Social Studies", "Computer Science"]

// One standardized, guided demo student (Type 1: Primary/Middle School with flexible out-of marks)
const DEMO_STUDENT: Student = {
  id: "demo-aarav-001",
  code: "EDU001",
  name: "Aarav Sharma",
  grade: "Class 5",
  section: "A",
  school: "Brightwood Model School",
  attendanceRate: 94,
  assignmentCompletion: 92,
  teacherNote: "Shows strong curiosity and problem-solving skills in science and computer labs. Active participant in classroom discussions.",
  scores: {
    Mathematics: { score: 42, outOf: 50 },
    Science: { score: 45, outOf: 50 },
    English: { score: 88, outOf: 100 },
    "Social Studies": { score: 76, outOf: 100 },
    "Computer Science": { score: 46, outOf: 50 },
  },
  examHistory: [
    { examName: "Test 1 (July)", score: 68 },
    { examName: "Test 2 (August)", score: 74 },
    { examName: "Mid-Term", score: 82 },
    { examName: "Test 3 (Recent)", score: 86 },
  ],
}

// Classmate fixture for multi-student comparisons in teacher gradebook
const DEMO_CLASSMATE: Student = {
  id: "demo-priya-002",
  code: "EDU002",
  name: "Priya Patel",
  grade: "Class 5",
  section: "A",
  school: "Brightwood Model School",
  attendanceRate: 98,
  assignmentCompletion: 96,
  teacherNote: "Exceptional diligence in language arts and science projects. Always completes assignments ahead of schedule.",
  scores: {
    Mathematics: { score: 46, outOf: 50 },
    Science: { score: 47, outOf: 50 },
    English: { score: 92, outOf: 100 },
    "Social Studies": { score: 84, outOf: 100 },
    "Computer Science": { score: 48, outOf: 50 },
  },
  examHistory: [
    { examName: "Test 1 (July)", score: 82 },
    { examName: "Test 2 (August)", score: 86 },
    { examName: "Mid-Term", score: 89 },
    { examName: "Test 3 (Recent)", score: 92 },
  ],
}

// Safe parser for subject score item
const getScoreDetails = (item?: any): { score: number; outOf: number; percent: number } => {
  if (!item) return { score: 0, outOf: 100, percent: 0 }
  if (typeof item === "object") {
    const sc = Number(item.score ?? 0)
    const out = Number(item.outOf ?? 100) || 100
    const pct = Math.round((sc / out) * 100)
    return { score: sc, outOf: out, percent: pct }
  }
  const sc = Number(item ?? 0)
  return { score: sc, outOf: 100, percent: sc }
}

interface ModalSubjectRow {
  subject: string
  score: number
  outOf: number
}

export default function App() {
  const { speak, stop } = useSpeechSynthesis()
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)

  // Navigation: Parent Report vs Teacher Gradebook
  const [mainView, setMainView] = useState<"parent" | "teacher">("parent")
  const [parentSubTab, setParentSubTab] = useState<"bars" | "benchmark" | "radar" | "stacked" | "growth" | "distribution" | "donut" | "all">("bars")

  // Available subjects pool & Students State - Starts empty with NO mock data
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(DEFAULT_SUBJECTS)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string>("")

  // Teacher Comparison Selectors
  const [compareStudentA, setCompareStudentA] = useState<string>("")
  const [compareStudentB, setCompareStudentB] = useState<string>("")

  // Demo Modal State & Toast Notifications
  const [showDemoModal, setShowDemoModal] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Add Subject Modal State
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState("")

  // Add Student Modal State (Now supports adding arbitrary subjects & outOf directly inside modal!)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [newStudentName, setNewStudentName] = useState("")
  const [newStudentCode, setNewStudentCode] = useState("")
  const [newStudentGrade, setNewStudentGrade] = useState("Class 5")
  const [newStudentSection, setNewStudentSection] = useState("A")
  const [modalSubjectRows, setModalSubjectRows] = useState<ModalSubjectRow[]>([])
  const [customSubjectToAdd, setCustomSubjectToAdd] = useState("")
  const [customScoreToAdd, setCustomScoreToAdd] = useState(40)
  const [customOutOfToAdd, setCustomOutOfToAdd] = useState(50)

  // Import Modal State (Direct Excel file upload + Paste)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importTab, setImportTab] = useState<"upload" | "paste">("upload")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false)
  const [excelAnalysisResult, setExcelAnalysisResult] = useState<ExcelAnalysisResult | null>(null)
  const [selectedWorksheet, setSelectedWorksheet] = useState<string>("")
  const [dragActive, setDragActive] = useState(false)
  const [pasteDataText, setPasteDataText] = useState("")
  const [importNotification, setImportNotification] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Current active student (or undefined if no students exist)
  const student: Student | undefined = students.find((s) => s.id === selectedStudentId) || students[0]

  // Calculate Average percentage for a student
  const getStudentAverage = (s?: Student | null) => {
    if (!s || !s.scores) return 0
    const list = Object.values(s.scores)
    if (!list.length) return 0
    const totalPct = list.reduce((acc, curr) => acc + getScoreDetails(curr).percent, 0)
    return Math.round(totalPct / list.length)
  }

  // Calculate Class Average for a subject
  const getClassSubjectAverage = (subjectName: string) => {
    if (!students.length) return 0
    const validScores = students
      .map((s) => s.scores[subjectName])
      .filter((v) => v !== undefined)
      .map((v) => getScoreDetails(v).percent)

    if (!validScores.length) return 0
    return Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
  }

  // Class Overall Average
  const classOverallAverage = students.length
    ? Math.round(students.reduce((acc, s) => acc + getStudentAverage(s), 0) / students.length)
    : 0

  // Notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Demo Handlers: Load single demo student (Aarav Sharma)
  const handleLoadDemoStudent = () => {
    setStudents([DEMO_STUDENT])
    setSelectedStudentId(DEMO_STUDENT.id)
    setCompareStudentA(DEMO_STUDENT.id)
    setCompareStudentB(DEMO_STUDENT.id)
    setShowDemoModal(false)
    setMainView("parent")
    showToast("✨ Demo Student (Aarav Sharma) loaded! Explore the 7 report card charts below.")
  }

  // Demo Handlers: Load full roster with classmate (for teacher comparisons)
  const handleLoadDemoRoster = () => {
    setStudents([DEMO_STUDENT, DEMO_CLASSMATE])
    setSelectedStudentId(DEMO_STUDENT.id)
    setCompareStudentA(DEMO_STUDENT.id)
    setCompareStudentB(DEMO_CLASSMATE.id)
    setShowDemoModal(false)
    showToast("✨ Demo Roster (Aarav Sharma & Priya Patel) loaded! Gradebook & comparison active.")
  }

  // Clear all data to return to clean empty state
  const handleClearAllData = () => {
    setStudents([])
    setSelectedStudentId("")
    setCompareStudentA("")
    setCompareStudentB("")
    setShowDemoModal(false)
    showToast("🗑️ All student data cleared. Site is now completely blank.")
  }

  // Voice speech synthesis
  const handleToggleVoice = () => {
    if (!student) return
    if (isPlayingAudio) {
      stop()
      setIsPlayingAudio(false)
    } else {
      const avg = getStudentAverage(student)
      const textToSpeak = `Hello! ${student.name}'s overall score is ${avg} percent across subjects with an attendance rate of ${student.attendanceRate} percent.`

      speak(textToSpeak, "en")
      setIsPlayingAudio(true)
      setTimeout(() => setIsPlayingAudio(false), 9000)
    }
  }

  // Open Add Student Modal & initialize its subject list
  const handleOpenAddStudentModal = () => {
    setModalSubjectRows(
      availableSubjects.map((sub) => ({
        subject: sub,
        score: sub === "English" || sub === "Social Studies" ? 75 : 38,
        outOf: sub === "English" || sub === "Social Studies" ? 100 : 50,
      }))
    )
    setNewStudentName("")
    setNewStudentCode(`EDU00${students.length + 1}`)
    setShowAddStudentModal(true)
  }

  // In-Modal: Add new subject row
  const handleAddSubjectInModal = () => {
    const trimmed = customSubjectToAdd.trim()
    if (!trimmed) return

    // Add to modal rows if not already there
    if (!modalSubjectRows.some((r) => r.subject.toLowerCase() === trimmed.toLowerCase())) {
      setModalSubjectRows([
        ...modalSubjectRows,
        {
          subject: trimmed,
          score: Number(customScoreToAdd),
          outOf: Number(customOutOfToAdd) || 100,
        },
      ])
    }

    // Also register in available subjects if new
    if (!availableSubjects.includes(trimmed)) {
      setAvailableSubjects([...availableSubjects, trimmed])
    }

    setCustomSubjectToAdd("")
    setCustomScoreToAdd(40)
    setCustomOutOfToAdd(50)
  }

  // In-Modal: Remove subject row
  const handleRemoveSubjectInModal = (subName: string) => {
    setModalSubjectRows(modalSubjectRows.filter((r) => r.subject !== subName))
  }

  // In-Modal: Update row score or outOf
  const handleUpdateSubjectRow = (subName: string, field: "score" | "outOf", value: number) => {
    setModalSubjectRows(
      modalSubjectRows.map((r) => {
        if (r.subject === subName) {
          return {
            ...r,
            [field]: value,
          }
        }
        return r
      })
    )
  }

  // Save new student from modal
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStudentName.trim()) return

    const constructedScores: { [sub: string]: SubjectScoreItem } = {}
    modalSubjectRows.forEach((r) => {
      constructedScores[r.subject] = {
        score: Number(r.score),
        outOf: Number(r.outOf) || 100,
      }
    })

    const newStudent: Student = {
      id: String(Date.now()),
      code: newStudentCode.trim() || `EDU00${students.length + 1}`,
      name: newStudentName.trim(),
      grade: newStudentGrade,
      section: newStudentSection,
      school: "Brightwood International School",
      attendanceRate: 92,
      assignmentCompletion: 90,
      teacherNote: `${newStudentName} participates actively. Good balance between assignments and practical work.`,
      scores: constructedScores,
      examHistory: [
        { examName: "Test 1", score: 68 },
        { examName: "Test 2", score: 74 },
        { examName: "Mid-Term", score: 80 },
      ],
    }

    setStudents([...students, newStudent])
    setSelectedStudentId(newStudent.id)
    setShowAddStudentModal(false)
  }

  // Global Add Subject handler
  const handleAddGlobalSubject = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newSubjectName.trim()
    if (!trimmed || availableSubjects.includes(trimmed)) return

    setAvailableSubjects([...availableSubjects, trimmed])
    // Assign default 35/50 to existing students
    setStudents(
      students.map((s) => ({
        ...s,
        scores: {
          ...s.scores,
          [trimmed]: { score: 35, outOf: 50 },
        },
      }))
    )

    setNewSubjectName("")
    setShowAddSubjectModal(false)
  }

  // Direct file selection & drag-and-drop handler
  const handleFileSelect = async (file: File) => {
    if (!file) return
    setUploadedFile(file)
    setIsAnalyzingFile(true)
    setImportNotification(null)

    try {
      const result = await parseExcelFile(file)
      setExcelAnalysisResult(result)
      setSelectedWorksheet(result.activeSheet)
      setImportNotification(null)
    } catch (err: any) {
      setImportNotification(err.message || "Failed to analyze Excel file. Please ensure it has student rows.")
      setExcelAnalysisResult(null)
    } finally {
      setIsAnalyzingFile(false)
    }
  }

  // Handle worksheet switch if multi-sheet workbook
  const handleWorksheetChange = async (sheetName: string) => {
    if (!uploadedFile) return
    setSelectedWorksheet(sheetName)
    setIsAnalyzingFile(true)
    try {
      const result = await parseExcelFile(uploadedFile, sheetName)
      setExcelAnalysisResult(result)
    } catch (err: any) {
      setImportNotification(err.message || "Could not parse selected worksheet.")
    } finally {
      setIsAnalyzingFile(false)
    }
  }

  // Generate & download ready-to-test sample Excel workbook
  const handleDownloadSampleExcel = async () => {
    try {
      const XLSX = await loadXLSXLibrary()
      const sampleData = [
        ["Student Name", "Roll Number", "Class", "Section", "Attendance", "Mathematics (50)", "Science (50)", "English (100)", "Social Studies (100)", "Computer Science (50)"],
        ["Rohan Varma", "EDU010", "Class 5", "A", "96%", "46/50", "44/50", "91/100", "84/100", "48/50"],
        ["Ananya Iyer", "EDU011", "Class 5", "A", "98%", "48/50", "49/50", "95/100", "92/100", "50/50"],
        ["Kabir Mehta", "EDU012", "Class 5", "A", "89%", "36/50", "39/50", "74/100", "68/100", "42/50"],
        ["Meera Joshi", "EDU013", "Class 5", "A", "94%", "41/50", "43/50", "86/100", "80/100", "45/50"],
        ["Arjun Nair", "EDU014", "Class 5", "A", "91%", "39/50", "37/50", "79/100", "75/100", "40/50"],
      ]
      const ws = XLSX.utils.aoa_to_sheet(sampleData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Class 5-A Marks")
      XLSX.writeFile(wb, "EduDrishti_Class5_Sample.xlsx")
      showToast("📥 Sample Excel file downloaded! You can upload it directly right now.")
    } catch {
      showToast("Could not generate sample file. Try pasting data instead.")
    }
  }

  // Quick try: Load sample spreadsheet into analysis (instant preview without file picker)
  const handleLoadSampleIntoUploader = () => {
    setIsAnalyzingFile(true)
    try {
      const result = parsePastedSpreadsheetText(sampleExcelData)
      setExcelAnalysisResult(result)
      setUploadedFile(new File([sampleExcelData], "Class5_Sample_Roster.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
      setSelectedWorksheet("Class 5-A Marks")
      setImportNotification(null)
    } catch (err: any) {
      setImportNotification(err.message || "Failed to load sample.")
    } finally {
      setIsAnalyzingFile(false)
    }
  }

  // Parse pasted clipboard text into preview analysis
  const handleParsePastedData = () => {
    if (!pasteDataText.trim()) {
      setImportNotification("Please paste some spreadsheet data or click 'Load Sample Data'.")
      return
    }
    try {
      const result = parsePastedSpreadsheetText(pasteDataText)
      setExcelAnalysisResult(result)
      setImportNotification(null)
    } catch (err: any) {
      setImportNotification(err.message || "Could not parse pasted data. Ensure format has column headers.")
    }
  }

  // Apply parsed analysis results into platform state
  const handleApplyAnalysisImport = () => {
    if (!excelAnalysisResult || excelAnalysisResult.students.length === 0) return

    const newSubjects = Array.from(new Set([...availableSubjects, ...excelAnalysisResult.subjects]))
    setAvailableSubjects(newSubjects)
    setStudents([...students, ...excelAnalysisResult.students])
    setSelectedStudentId(excelAnalysisResult.students[0].id)
    setShowImportModal(false)
    const count = excelAnalysisResult.students.length
    const avg = excelAnalysisResult.analysis.classAverage
    const subCount = excelAnalysisResult.subjects.length
    setExcelAnalysisResult(null)
    setUploadedFile(null)
    setPasteDataText("")

    showToast(`🎉 Successfully analyzed & loaded ${count} students across ${subCount} subjects! Class Average: ${avg}%`)
  }

  // Sample copyable format
  const sampleExcelData = `Student Name\tRoll Number\tClass\tSection\tAttendance\tMathematics (50)\tScience (50)\tEnglish (100)\tSocial Studies (100)\tComputer Science (50)
Rohan Varma\tEDU010\tClass 5\tA\t96%\t46/50\t44/50\t91/100\t84/100\t48/50
Ananya Iyer\tEDU011\tClass 5\tA\t98%\t48/50\t49/50\t95/100\t92/100\t50/50
Kabir Mehta\tEDU012\tClass 5\tA\t89%\t36/50\t39/50\t74/100\t68/100\t42/50
Meera Joshi\tEDU013\tClass 5\tA\t94%\t41/50\t43/50\t86/100\t80/100\t45/50
Arjun Nair\tEDU014\tClass 5\tA\t91%\t39/50\t37/50\t79/100\t75/100\t40/50`

  // Comparison Students
  const compA = students.find((s) => s.id === compareStudentA) || students[0]
  const compB = students.find((s) => s.id === compareStudentB) || students[1] || students[0]

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--nb-bg)", fontFamily: "var(--font-body)" }}>
      
      {/* Neo-Brutalist Top Banner Navigation */}
      <header style={{ background: "var(--nb-yellow)", borderBottom: "3.5px solid #000000", boxShadow: "0 4px 0 #000000", padding: "0.75rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.2rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.25rem", color: "#000000", textTransform: "uppercase", letterSpacing: "-0.03em" }}>
              ⚡ EduDrishti + LearnPulse
            </span>
            <span className="nb-badge" style={{ background: "#000000", color: "#fde047", padding: "0.15rem 0.45rem", fontSize: "0.7rem" }}>
              NEO-V2
            </span>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: "flex", background: "#ffffff", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", borderRadius: "10px", padding: "3px", gap: "3px" }}>
            <button
              onClick={() => setMainView("parent")}
              style={{
                background: mainView === "parent" ? "#000000" : "transparent",
                color: mainView === "parent" ? "#ffffff" : "#000000",
                border: "none",
                padding: "0.4rem 0.9rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 800,
                fontFamily: "var(--font-display)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              👨‍👩‍👧 Parent Report Card
            </button>
            <button
              onClick={() => setMainView("teacher")}
              style={{
                background: mainView === "teacher" ? "#000000" : "transparent",
                color: mainView === "teacher" ? "#ffffff" : "#000000",
                border: "none",
                padding: "0.4rem 0.9rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 800,
                fontFamily: "var(--font-display)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              👩‍🏫 Teacher Marks & Comparison ({students.length})
            </button>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" }}>
          {/* ✨ Prominent Demo Guide & Loader Button */}
          <button
            onClick={() => setShowDemoModal(true)}
            className="nb-btn"
            style={{
              background: "#000000",
              color: "#fde047",
              padding: "0.45rem 0.95rem",
              fontSize: "0.82rem",
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              boxShadow: "2px 2px 0px #000000",
            }}
          >
            <span>✨</span>
            <span>Demo Guide</span>
          </button>

          {students.length > 0 && (
            <button
              onClick={handleClearAllData}
              className="nb-btn"
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
                padding: "0.45rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 800,
              }}
              title="Clear all student data to start with empty records"
            >
              🗑️ Clear Data
            </button>
          )}

          <button
            onClick={() => setShowAddSubjectModal(true)}
            className="nb-btn"
            style={{
              background: "var(--nb-purple-light)",
              color: "#000000",
              padding: "0.45rem 0.85rem",
              fontSize: "0.8rem",
            }}
          >
            + Add Subject ({availableSubjects.length})
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="nb-btn"
            style={{
              background: "var(--nb-lime)",
              color: "#000000",
              padding: "0.45rem 0.85rem",
              fontSize: "0.8rem",
            }}
          >
            📊 Import Excel / Sheets
          </button>

          <button
            onClick={handleOpenAddStudentModal}
            className="nb-btn"
            style={{
              background: "var(--nb-cyan)",
              color: "#000000",
              padding: "0.45rem 0.95rem",
              fontSize: "0.8rem",
            }}
          >
            + Add Student Details
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            maxWidth: "1200px",
            width: "calc(100% - 3rem)",
            margin: "1rem auto 0",
            background: "var(--nb-lime)",
            color: "#000000",
            border: "3px solid #000000",
            boxShadow: "4px 4px 0px #000000",
            borderRadius: "10px",
            padding: "0.75rem 1.2rem",
            fontWeight: 800,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              fontWeight: 900,
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ maxWidth: "1200px", width: "100%", margin: "0 auto", padding: "1.5rem" }}>
        
        {/* ======================= VIEW: PARENT REPORT CARD ======================= */}
        {mainView === "parent" && (
          !student ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Neo-Brutalist Clean Slate Welcome Card */}
              <div className="nb-card" style={{ padding: "2.5rem 2rem", background: "#ffffff", textAlign: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "var(--nb-yellow)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "0.3rem 0.8rem", borderRadius: "8px", fontWeight: 900, fontSize: "0.85rem", textTransform: "uppercase", marginBottom: "1rem" }}>
                  <span>🌱</span> Clean Slate • No Mock Data Preloaded
                </div>

                <h1 style={{ fontSize: "2.2rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", letterSpacing: "-0.03em", margin: "0.3rem 0 0.8rem" }}>
                  Welcome to EduDrishti + LearnPulse
                </h1>

                <p style={{ maxWidth: "680px", margin: "0 auto 1.8rem", color: "#334155", fontSize: "1.05rem", lineHeight: 1.6, fontWeight: 600 }}>
                  All mock data has been cleared from the platform. You can explore how the 7 visual charts and parent voice summaries work by launching our <strong>Guided Demo</strong>, or start entering your own students immediately!
                </p>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                  <button
                    onClick={handleLoadDemoStudent}
                    className="nb-btn"
                    style={{
                      background: "var(--nb-yellow)",
                      color: "#000000",
                      padding: "0.85rem 1.6rem",
                      fontSize: "1rem",
                      fontWeight: 900,
                    }}
                  >
                    <span>🚀 Load Guided Demo Student</span>
                  </button>

                  <button
                    onClick={() => setShowDemoModal(true)}
                    className="nb-btn"
                    style={{
                      background: "var(--nb-cyan)",
                      color: "#000000",
                      padding: "0.85rem 1.4rem",
                      fontSize: "0.95rem",
                      fontWeight: 900,
                    }}
                  >
                    <span>📖 Open Demo Guide & Walkthrough</span>
                  </button>

                  <button
                    onClick={handleOpenAddStudentModal}
                    className="nb-btn"
                    style={{
                      background: "var(--nb-lime)",
                      color: "#000000",
                      padding: "0.85rem 1.4rem",
                      fontSize: "0.95rem",
                      fontWeight: 900,
                    }}
                  >
                    <span>+ Add Student Details</span>
                  </button>

                  <button
                    onClick={() => setShowImportModal(true)}
                    className="nb-btn"
                    style={{
                      background: "#ffffff",
                      color: "#000000",
                      padding: "0.85rem 1.4rem",
                      fontSize: "0.95rem",
                      fontWeight: 900,
                    }}
                  >
                    <span>📊 Import Excel / Sheets</span>
                  </button>
                </div>

                {/* Feature Highlights Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.2rem", textAlign: "left" }}>
                  <div style={{ background: "var(--nb-cyan-light)", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000" }}>
                    <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>📊</div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      Flexible Out-Of Scoring
                    </h3>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Supports custom total marks (e.g. 42/50, 88/100) and automatically scales them into standardized percentages.
                    </p>
                  </div>

                  <div style={{ background: "var(--nb-lime-light)", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000" }}>
                    <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>🕸️</div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      7 Neo-Brutalist Charts
                    </h3>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Progress bars, radar spider web, class benchmarks, growth trajectory, gap analysis, and mastery donut ring.
                    </p>
                  </div>

                  <div style={{ background: "var(--nb-orange-light)", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000" }}>
                    <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>🔊</div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      Voice Summary Readout
                    </h3>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Instant spoken audio narration designed for parent accessibility.
                    </p>
                  </div>

                  <div style={{ background: "var(--nb-purple-light)", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000" }}>
                    <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>👩‍🏫</div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      Teacher Gradebook & Sync
                    </h3>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Compare students side-by-side, analyze class averages, and paste data straight from Excel or Google Sheets.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Child Header Card */}
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
                  <div style={{ width: "68px", height: "68px", borderRadius: "10px", background: "var(--nb-pink)", border: "3px solid #000000", boxShadow: "3px 3px 0px #000000", color: "#000000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: 900 }}>
                    {student.name[0]}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                        {student.name}
                      </h2>
                      <span className="nb-badge" style={{ background: "var(--nb-lime)", color: "#000000" }}>
                        {student.grade} • {student.section}
                      </span>
                      <span className="nb-badge" style={{ background: "var(--nb-yellow)", color: "#000000" }}>
                        ROLL: {student.code}
                      </span>
                    </div>
                    <p style={{ color: "#334155", fontSize: "0.95rem", fontWeight: 600, marginTop: "0.3rem" }}>
                      🏫 {student.school}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="nb-select"
                    style={{ fontSize: "0.9rem", cursor: "pointer" }}
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleToggleVoice}
                    className="nb-btn"
                    style={{
                      background: isPlayingAudio ? "var(--nb-red)" : "var(--nb-yellow)",
                      color: "#000000",
                      padding: "0.65rem 1.2rem",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>{isPlayingAudio ? "⏹️" : "🔊"}</span>
                    <span>{isPlayingAudio ? "Stop Voice" : "Listen in Voice"}</span>
                  </button>
                </div>
              </div>

              {/* Plain Language Summary */}
              <div style={{ background: "var(--nb-yellow-light)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1rem 1.4rem", borderRadius: "10px", marginTop: "1.2rem" }}>
                <strong style={{ color: "#000000", fontSize: "1rem", fontFamily: "var(--font-display)" }}>
                  💡 What this means for parents:
                </strong>
                <p style={{ color: "#1e293b", fontSize: "0.95rem", marginTop: "0.25rem", lineHeight: 1.6, fontWeight: 600 }}>
                  {student.name}'s overall score is <strong style={{ color: "#000000", background: "var(--nb-yellow)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{getStudentAverage(student)}%</strong> across {Object.keys(student.scores).length} subjects. Attendance rate is <strong style={{ color: "#000000", background: "var(--nb-lime)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{student.attendanceRate}%</strong>.
                </p>
              </div>
            </div>

            {/* Quick Metrics (Neo-Brutalist Chunky Cards) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.2rem", marginBottom: "1.5rem" }}>
              <div className="nb-card" style={{ background: "var(--nb-cyan-light)", padding: "1.4rem" }}>
                <span className="nb-badge" style={{ background: "#000000", color: "var(--nb-cyan)", marginBottom: "0.5rem" }}>
                  Overall Term Score
                </span>
                <h3 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>
                  {getStudentAverage(student)}%
                </h3>
                <span style={{ color: "#000000", fontSize: "0.85rem", fontWeight: 800 }}>
                  ★ Active in {Object.keys(student.scores).length} Subjects
                </span>
              </div>

              <div className="nb-card" style={{ background: "var(--nb-lime-light)", padding: "1.4rem" }}>
                <span className="nb-badge" style={{ background: "#000000", color: "var(--nb-lime)", marginBottom: "0.5rem" }}>
                  Attendance Record
                </span>
                <h3 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>
                  {student.attendanceRate}%
                </h3>
                <span style={{ color: "#000000", fontSize: "0.85rem", fontWeight: 800 }}>
                  ★ Regular & Punctual
                </span>
              </div>

              <div className="nb-card" style={{ background: "var(--nb-orange-light)", padding: "1.4rem" }}>
                <span className="nb-badge" style={{ background: "#000000", color: "var(--nb-orange)", marginBottom: "0.5rem" }}>
                  Homework Completed
                </span>
                <h3 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>
                  {student.assignmentCompletion}%
                </h3>
                <span style={{ color: "#000000", fontSize: "0.85rem", fontWeight: 800 }}>
                  ★ On-time Submissions
                </span>
              </div>
            </div>

            {/* Parent Sub Tabs (Neo-Brutalist Chunky Pills) */}
            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", overflowX: "auto", paddingBottom: "0.4rem", flexWrap: "wrap" }}>
              <button
                onClick={() => setParentSubTab("bars")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "bars" ? "#000000" : "#ffffff",
                  color: parentSubTab === "bars" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                📊 Subject Bars (Score / Out-Of)
              </button>

              <button
                onClick={() => setParentSubTab("benchmark")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "benchmark" ? "#000000" : "#ffffff",
                  color: parentSubTab === "benchmark" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                ⚖️ Student vs Class Benchmark
              </button>

              <button
                onClick={() => setParentSubTab("radar")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "radar" ? "#000000" : "#ffffff",
                  color: parentSubTab === "radar" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                🕸️ Skills Spider/Radar Web
              </button>

              <button
                onClick={() => setParentSubTab("stacked")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "stacked" ? "#000000" : "#ffffff",
                  color: parentSubTab === "stacked" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                🎯 Marks Scored vs Missed
              </button>

              <button
                onClick={() => setParentSubTab("growth")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "growth" ? "#000000" : "#ffffff",
                  color: parentSubTab === "growth" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                📈 Exam Trajectory & Target
              </button>

              <button
                onClick={() => setParentSubTab("distribution")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "distribution" ? "#000000" : "#ffffff",
                  color: parentSubTab === "distribution" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                🔔 Bell-Curve & Quartile
              </button>

              <button
                onClick={() => setParentSubTab("donut")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "donut" ? "#000000" : "#ffffff",
                  color: parentSubTab === "donut" ? "var(--nb-yellow)" : "#000000",
                  fontSize: "0.85rem",
                }}
              >
                ⭕ Mastery Donut
              </button>

              <button
                onClick={() => setParentSubTab("all")}
                className="nb-btn"
                style={{
                  padding: "0.55rem 0.95rem",
                  background: parentSubTab === "all" ? "var(--nb-yellow)" : "#ffffff",
                  color: "#000000",
                  fontSize: "0.85rem",
                }}
              >
                🗂️ View All Charts (Overview)
              </button>
            </div>

            {/* ===================== CHART 1: SUBJECT PROGRESS BARS ===================== */}
            {(parentSubTab === "bars" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.8rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      📊 Subject Marks Graph (Showcasing Marks Scored Out Of Total)
                    </h3>
                    <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                      Clearly displays raw marks scored out of total test marks (e.g. 45/50, 88/100) alongside scaled percentage
                    </p>
                  </div>
                  <button
                    onClick={handleOpenAddStudentModal}
                    className="nb-btn"
                    style={{ background: "var(--nb-yellow)", color: "#000000", padding: "0.45rem 0.9rem", fontSize: "0.85rem" }}
                  >
                    + Add Another Subject / Student
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
                  {Object.entries(student.scores).map(([sub, scoreObj]) => {
                    const { score, outOf, percent } = getScoreDetails(scoreObj)
                    const isGreat = percent >= 80
                    const isOkay = percent >= 65 && percent < 80
                    const barColor = isGreat ? "var(--nb-lime)" : isOkay ? "var(--nb-cyan)" : "var(--nb-red)"
                    const statusText = isGreat ? "Excellent" : isOkay ? "Good Progress" : "Needs Revision"

                    return (
                      <div key={sub} style={{ background: "#ffffff", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "4px 4px 0px #000000" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <strong style={{ fontSize: "1.1rem", color: "#000000", fontFamily: "var(--font-display)", fontWeight: 900 }}>{sub}</strong>
                            <span className="nb-badge" style={{ background: barColor, color: "#000000" }}>
                              {statusText}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                            <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                              {score}
                            </span>
                            <span style={{ fontSize: "1.1rem", color: "#475569", fontWeight: 800 }}>
                              / {outOf}
                            </span>
                            <span className="nb-badge" style={{ background: "#000000", color: "#ffffff", marginLeft: "0.4rem" }}>
                              {percent}%
                            </span>
                          </div>
                        </div>

                        {/* Chunky Neo-Brutalist Track */}
                        <div className="nb-progress-track" style={{ margin: "0.7rem 0" }}>
                          <div
                            style={{
                              width: `${Math.min(100, percent)}%`,
                              height: "100%",
                              background: barColor,
                              borderRight: "2.5px solid #000000",
                              transition: "width 0.4s ease",
                            }}
                          ></div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#334155", fontWeight: 700, flexWrap: "wrap", gap: "0.5rem" }}>
                          <span>Scored <strong style={{ color: "#000000" }}>{score} marks</strong> out of maximum <strong style={{ color: "#000000" }}>{outOf} marks</strong></span>
                          <span style={{ background: "var(--nb-yellow-light)", padding: "0.1rem 0.5rem", border: "1.5px solid #000", borderRadius: "4px" }}>🎯 Target: &gt; 70%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===================== CHART 2: STUDENT VS CLASS BENCHMARK ===================== */}
            {(parentSubTab === "benchmark" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.8rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      ⚖️ Student Score vs. Class Benchmark (Subject-by-Subject)
                    </h3>
                    <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                      Compares {student.name}'s marks against the average scored by classmates in each subject
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", fontWeight: 800 }}>
                    <span className="nb-badge" style={{ background: "var(--nb-cyan)", color: "#000000" }}>
                      ★ {student.name}
                    </span>
                    <span className="nb-badge" style={{ background: "var(--nb-orange)", color: "#000000" }}>
                      ★ Class Average
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                  {Object.entries(student.scores).map(([sub, scoreObj]) => {
                    const { score, outOf, percent } = getScoreDetails(scoreObj)
                    const classAvg = getClassSubjectAverage(sub)
                    const diff = percent - classAvg
                    const isAbove = diff >= 0

                    return (
                      <div key={sub} style={{ background: "#ffffff", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "4px 4px 0px #000000" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 900, fontSize: "1.1rem", color: "#000000", fontFamily: "var(--font-display)" }}>{sub}</span>
                          <span
                            className="nb-badge"
                            style={{
                              background: isAbove ? "var(--nb-lime)" : "var(--nb-red)",
                              color: "#000000",
                            }}
                          >
                            {isAbove ? `+${diff}% Above Class Avg 🚀` : `${diff}% Behind Class Avg ⚠️`}
                          </span>
                        </div>

                        {/* Dual Bar Layout */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                          {/* Student Bar */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 800, marginBottom: "0.2rem" }}>
                              <span style={{ color: "#000000" }}>{student.name} ({score}/{outOf})</span>
                              <strong style={{ color: "#000000", background: "var(--nb-cyan)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{percent}%</strong>
                            </div>
                            <div style={{ height: "14px", background: "#f1f5f9", border: "2px solid #000000", borderRadius: "6px", overflow: "hidden" }}>
                              <div style={{ width: `${percent}%`, height: "100%", background: "var(--nb-cyan)", borderRight: "2px solid #000000" }}></div>
                            </div>
                          </div>

                          {/* Class Average Bar */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 800, marginBottom: "0.2rem" }}>
                              <span style={{ color: "#000000" }}>Class Benchmark Average</span>
                              <strong style={{ color: "#000000", background: "var(--nb-orange)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{classAvg}%</strong>
                            </div>
                            <div style={{ height: "14px", background: "#f1f5f9", border: "2px solid #000000", borderRadius: "6px", overflow: "hidden" }}>
                              <div style={{ width: `${classAvg}%`, height: "100%", background: "var(--nb-orange)", borderRight: "2px solid #000000" }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===================== CHART 3: HOLISTIC SPIDER/RADAR WEB CHART ===================== */}
            {(parentSubTab === "radar" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.8rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      🕸️ Holistic Competency Spider/Radar Web
                    </h3>
                    <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                      Multi-axial radar map showing learning symmetry across subjects and comparing {student.name} against class benchmarks
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", fontWeight: 800 }}>
                    <span className="nb-badge" style={{ background: "var(--nb-cyan)", color: "#000000" }}>
                      ★ {student.name}
                    </span>
                    <span className="nb-badge" style={{ background: "var(--nb-orange)", color: "#000000" }}>
                      ★ Class Average
                    </span>
                  </div>
                </div>

                {(() => {
                  const subEntries = Object.entries(student.scores)
                  const n = subEntries.length || 1
                  const cx = 250
                  const cy = 210
                  const maxR = 135
                  const rings = [0.25, 0.5, 0.75, 1.0]

                  const studentPoints = subEntries.map(([_, scoreObj], i) => {
                    const { percent } = getScoreDetails(scoreObj)
                    const angle = (Math.PI * 2 / n) * i - Math.PI / 2
                    const r = (Math.min(100, Math.max(0, percent)) / 100) * maxR
                    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
                  }).join(" ")

                  const classPoints = subEntries.map(([subName], i) => {
                    const avg = getClassSubjectAverage(subName)
                    const angle = (Math.PI * 2 / n) * i - Math.PI / 2
                    const r = (Math.min(100, Math.max(0, avg)) / 100) * maxR
                    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
                  }).join(" ")

                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                      <svg viewBox="0 0 500 420" style={{ width: "100%", maxWidth: "480px", height: "360px" }}>
                        {/* Concentric Guide Rings */}
                        {rings.map((ringLevel) => {
                          const ringPoints = Array.from({ length: n }).map((_, i) => {
                            const angle = (Math.PI * 2 / n) * i - Math.PI / 2
                            const r = ringLevel * maxR
                            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
                          }).join(" ")

                          return (
                            <g key={ringLevel}>
                              <polygon
                                points={ringPoints}
                                fill={ringLevel === 1.0 ? "var(--nb-yellow-light)" : "none"}
                                stroke="#000000"
                                strokeWidth={ringLevel === 1.0 ? "2.5" : "1.5"}
                                strokeDasharray={ringLevel === 1.0 ? "0" : "4 4"}
                              />
                              <text x={cx + 6} y={cy - ringLevel * maxR - 4} fontSize="10" fill="#000000" fontWeight="900" fontFamily="var(--font-display)">
                                {Math.round(ringLevel * 100)}%
                              </text>
                            </g>
                          )
                        })}

                        {/* Radial Axis Spokes & Subject Labels */}
                        {subEntries.map(([subName, scoreObj], i) => {
                          const { score, outOf, percent } = getScoreDetails(scoreObj)
                          const angle = (Math.PI * 2 / n) * i - Math.PI / 2
                          const x2 = cx + maxR * Math.cos(angle)
                          const y2 = cy + maxR * Math.sin(angle)

                          const labelR = maxR + 34
                          const labelX = cx + labelR * Math.cos(angle)
                          const labelY = cy + labelR * Math.sin(angle)

                          return (
                            <g key={subName}>
                              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#000000" strokeWidth="2" />
                              <rect
                                x={labelX - 44}
                                y={labelY - 14}
                                width="88"
                                height="28"
                                rx="6"
                                fill="#ffffff"
                                stroke="#000000"
                                strokeWidth="2"
                              />
                              <text
                                x={labelX}
                                y={labelY - 2}
                                fontSize="10"
                                fontWeight="900"
                                fill="#000000"
                                textAnchor="middle"
                                fontFamily="var(--font-display)"
                              >
                                {subName}
                              </text>
                              <text
                                x={labelX}
                                y={labelY + 9}
                                fontSize="9"
                                fontWeight="800"
                                fill="#2563eb"
                                textAnchor="middle"
                              >
                                {score}/{outOf} ({percent}%)
                              </text>
                            </g>
                          )
                        })}

                        {/* Class Benchmark Polygon (Orange dashed) */}
                        <polygon
                          points={classPoints}
                          fill="rgba(251, 146, 60, 0.18)"
                          stroke="#fb923c"
                          strokeWidth="3"
                          strokeDasharray="5 4"
                        />

                        {/* Student Polygon (Cyan filled with bold black border) */}
                        <polygon
                          points={studentPoints}
                          fill="rgba(56, 189, 248, 0.45)"
                          stroke="#000000"
                          strokeWidth="3.5"
                        />

                        {/* Student Vertex Dots */}
                        {subEntries.map(([_, scoreObj], i) => {
                          const { percent } = getScoreDetails(scoreObj)
                          const angle = (Math.PI * 2 / n) * i - Math.PI / 2
                          const r = (Math.min(100, Math.max(0, percent)) / 100) * maxR
                          return (
                            <circle
                              key={i}
                              cx={cx + r * Math.cos(angle)}
                              cy={cy + r * Math.sin(angle)}
                              r="7"
                              fill="var(--nb-yellow)"
                              stroke="#000000"
                              strokeWidth="2.5"
                            />
                          )
                        })}
                      </svg>

                      {/* Parent Interpretation Box */}
                      <div style={{ marginTop: "0.8rem", background: "var(--nb-lime-light)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1rem 1.4rem", borderRadius: "10px", width: "100%", fontSize: "0.9rem", color: "#000000", fontWeight: 700 }}>
                        💡 <strong>Parent Takeaway:</strong> The wider the blue spider web, the stronger the student's overall foundation. Peaks show core passion areas (e.g., <strong>Computer Science & Languages</strong>), while gentle indentations show where 15 minutes of guided homework can deliver big leaps!
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ===================== CHART 4: MARKS SCORED VS MISSED (OUT-OF GAP ANALYSIS) ===================== */}
            {(parentSubTab === "stacked" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.8rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      🎯 Marks Scored vs. Missed Gap Analysis (Exact Out-Of Breakdown)
                    </h3>
                    <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                      Visualizes exact marks secured vs remaining marks to reach perfection for every subject test
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", fontWeight: 800 }}>
                    <span className="nb-badge" style={{ background: "var(--nb-lime)", color: "#000000" }}>
                      ✓ Marks Secured
                    </span>
                    <span className="nb-badge" style={{ background: "var(--nb-red-light)", color: "#000000" }}>
                      ✕ Missed / Room to Grow
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                  {Object.entries(student.scores).map(([sub, scoreObj]) => {
                    const { score, outOf, percent } = getScoreDetails(scoreObj)
                    const missed = Math.max(0, outOf - score)
                    const targetScore = Math.ceil(outOf * 0.9) // 90% distinction mark
                    const neededForDistinction = Math.max(0, targetScore - score)

                    return (
                      <div key={sub} style={{ background: "#ffffff", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "4px 4px 0px #000000" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <strong style={{ fontSize: "1.1rem", color: "#000000", fontFamily: "var(--font-display)", fontWeight: 900 }}>{sub}</strong>
                            <span className="nb-badge" style={{ background: "var(--nb-yellow)", color: "#000000" }}>
                              Total: {outOf} Marks
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.9rem", alignItems: "center", fontWeight: 800 }}>
                            <span style={{ color: "#15803d" }}>
                              ✓ {score} secured
                            </span>
                            <span style={{ color: "#94a3b8" }}>•</span>
                            <span style={{ color: missed === 0 ? "#15803d" : "#b91c1c" }}>
                              {missed === 0 ? "★ Full Marks!" : `${missed} lost`}
                            </span>
                            <span className="nb-badge" style={{ background: "#000000", color: "#ffffff" }}>
                              {percent}%
                            </span>
                          </div>
                        </div>

                        {/* Segmented Dual Bar with Neo-Brutalist Border & Shadow */}
                        <div style={{ height: "26px", background: "#f1f5f9", borderRadius: "8px", overflow: "hidden", display: "flex", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000" }}>
                          <div
                            style={{
                              width: `${percent}%`,
                              background: "var(--nb-lime)",
                              borderRight: "2.5px solid #000000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#000000",
                              fontSize: "0.8rem",
                              fontWeight: 900,
                              transition: "width 0.4s ease",
                            }}
                          >
                            {percent > 20 && `${score} / ${outOf}`}
                          </div>
                          <div
                            style={{
                              width: `${100 - percent}%`,
                              background: "repeating-linear-gradient(45deg, #fecdd3, #fecdd3 10px, #fda4af 10px, #fda4af 20px)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#000000",
                              fontSize: "0.8rem",
                              fontWeight: 900,
                            }}
                          >
                            {100 - percent > 20 && `-${missed}`}
                          </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", fontSize: "0.85rem", flexWrap: "wrap", gap: "0.5rem", fontWeight: 700 }}>
                          <span style={{ color: "#475569" }}>
                            Current score: <strong style={{ color: "#000000" }}>{score} marks</strong> out of <strong style={{ color: "#000000" }}>{outOf} total</strong>
                          </span>
                          {neededForDistinction > 0 ? (
                            <span className="nb-badge" style={{ background: "var(--nb-cyan-light)", color: "#000000" }}>
                              🎯 Needs only <strong>+{neededForDistinction} marks</strong> to hit 90% Distinction!
                            </span>
                          ) : (
                            <span className="nb-badge" style={{ background: "var(--nb-lime)", color: "#000000" }}>
                              🌟 Distinction Level (≥90%) Achieved!
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===================== CHART 5: EXAM GROWTH CURVE & TARGET GOAL ===================== */}
            {(parentSubTab === "growth" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.8rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      📈 Sequential Exam Growth Curve & Target Goal (85%)
                    </h3>
                    <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                      Curved trendline tracing trajectory from Diagnostic exam toward the target distinction milestone
                    </p>
                  </div>
                  <span className="nb-badge" style={{ background: "var(--nb-yellow)", color: "#000000" }}>
                    🎯 Target Distinction Goal: 85%
                  </span>
                </div>

                {/* SVG Smooth Curve Area Chart */}
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <svg viewBox="0 0 650 250" style={{ width: "100%", height: "250px" }}>
                    <defs>
                      <linearGradient id="nbGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fde047" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#fde047" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid & Target Line (85%) */}
                    {[50, 70, 85, 100].map((val) => {
                      const y = 210 - ((val - 40) / 60) * 160
                      const isTarget = val === 85
                      return (
                        <g key={val}>
                          <line
                            x1="50"
                            y1={y}
                            x2="610"
                            y2={y}
                            stroke={isTarget ? "#000000" : "#cbd5e1"}
                            strokeWidth={isTarget ? "2.5" : "1.5"}
                            strokeDasharray={isTarget ? "6 4" : "0"}
                          />
                          <text x="40" y={y + 4} fontSize="11" fill="#000000" textAnchor="end" fontWeight={isTarget ? 900 : 700} fontFamily="var(--font-display)">
                            {val}%
                          </text>
                        </g>
                      )
                    })}

                    {/* Area under curve */}
                    {(() => {
                      const examList = (student.examHistory && student.examHistory.length > 0)
                        ? student.examHistory
                        : [{ examName: "Current", score: getStudentAverage(student) }]

                      const pts = examList.map((ex, i) => {
                        const step = examList.length > 1 ? 480 / (examList.length - 1) : 0
                        const x = 90 + (examList.length > 1 ? i * step : 200)
                        const y = 210 - ((ex.score - 40) / 60) * 160
                        return { x, y }
                      })

                      const pathD = pts.length > 1
                        ? `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") + ` L ${pts[pts.length - 1].x} 210 L ${pts[0].x} 210 Z`
                        : ""
                      const lineD = pts.length > 1
                        ? `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")
                        : ""

                      return (
                        <>
                          {pathD && <path d={pathD} fill="url(#nbGrowthGradient)" />}
                          {lineD && <path d={lineD} fill="none" stroke="#000000" strokeWidth="4.5" strokeLinecap="round" />}
                          {pts.map((p, idx) => (
                            <g key={idx}>
                              <circle cx={p.x} cy={p.y} r="8" fill="var(--nb-cyan)" stroke="#000000" strokeWidth="3" />
                              <rect x={p.x - 24} y={p.y - 30} width="48" height="22" rx="6" fill="var(--nb-yellow)" stroke="#000000" strokeWidth="2" />
                              <text x={p.x} y={p.y - 15} fontSize="11" fontWeight="900" fill="#000000" textAnchor="middle" fontFamily="var(--font-display)">
                                {examList[idx].score}%
                              </text>
                            </g>
                          ))}
                        </>
                      )
                    })()}

                    {/* X-Axis Exam Labels */}
                    {((student.examHistory && student.examHistory.length > 0) ? student.examHistory : [{ examName: "Current", score: getStudentAverage(student) }]).map((ex, i, arr) => {
                      const step = arr.length > 1 ? 480 / (arr.length - 1) : 0
                      const x = 90 + (arr.length > 1 ? i * step : 200)
                      return (
                        <text key={ex.examName + i} x={x} y="235" fontSize="12" fill="#000000" fontWeight="900" textAnchor="middle" fontFamily="var(--font-display)">
                          {ex.examName}
                        </text>
                      )
                    })}
                  </svg>
                </div>

                <div style={{ marginTop: "1rem", background: "var(--nb-cyan-light)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1rem 1.4rem", borderRadius: "10px", fontSize: "0.9rem", color: "#000000", fontWeight: 700 }}>
                  💡 <strong>Parent Takeaway:</strong> {student.name} maintains an overall average of <strong style={{ background: "var(--nb-yellow)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{getStudentAverage(student)}%</strong> across exams. Consistent dedication ensures continuous learning mastery!
                </div>
              </div>
            )}

            {/* ===================== CHART 6: CLASS BELL-CURVE & RANK TIERS ===================== */}
            {(parentSubTab === "distribution" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ marginBottom: "1.2rem" }}>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                    🔔 Class Performance Distribution & Tier Ranking
                  </h3>
                  <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                    Visual representation of where {student.name} stands among achievement quartiles
                  </p>
                </div>

                {/* Bell-Curve Tiers Graphic */}
                {(() => {
                  const avg = getStudentAverage(student)
                  const isTier1 = avg < 60
                  const isTier2 = avg >= 60 && avg < 75
                  const isTier3 = avg >= 75 && avg < 90
                  const isTier4 = avg >= 90
                  const tierLabel = isTier4 ? "Distinction" : isTier3 ? "Proficient High Achiever" : isTier2 ? "Developing Steady" : "Foundational"

                  return (
                    <>
                      <div style={{ background: "var(--nb-bg)", padding: "1.5rem", borderRadius: "12px", border: "2.5px solid #000000", boxShadow: "4px 4px 0px #000000", marginBottom: "1.5rem" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.8rem", textAlign: "center" }}>
                          
                          {/* Tier 1 */}
                          <div style={{ background: "var(--nb-red-light)", border: isTier1 ? "3.5px solid #000000" : "2px solid #000000", boxShadow: isTier1 ? "6px 6px 0px #000000" : "3px 3px 0px #000000", padding: "1.2rem 0.6rem", borderRadius: "10px", position: "relative" }}>
                            {isTier1 && (
                              <span className="nb-badge" style={{ position: "absolute", top: "-12px", right: "6px", background: "#000000", color: "var(--nb-yellow)", fontSize: "0.65rem" }}>
                                📍 {student.name} IS HERE
                              </span>
                            )}
                            <span className="nb-badge" style={{ background: "var(--nb-red)", color: "#000000", fontSize: "0.65rem" }}>Foundational</span>
                            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", margin: "0.4rem 0", fontFamily: "var(--font-display)" }}>&lt; 60%</div>
                            <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 700 }}>Needs Extra Support</span>
                          </div>

                          {/* Tier 2 */}
                          <div style={{ background: "var(--nb-yellow-light)", border: isTier2 ? "3.5px solid #000000" : "2px solid #000000", boxShadow: isTier2 ? "6px 6px 0px #000000" : "3px 3px 0px #000000", padding: "1.2rem 0.6rem", borderRadius: "10px", position: "relative" }}>
                            {isTier2 && (
                              <span className="nb-badge" style={{ position: "absolute", top: "-12px", right: "6px", background: "#000000", color: "var(--nb-yellow)", fontSize: "0.65rem" }}>
                                📍 {student.name} IS HERE
                              </span>
                            )}
                            <span className="nb-badge" style={{ background: "var(--nb-yellow)", color: "#000000", fontSize: "0.65rem" }}>Developing</span>
                            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", margin: "0.4rem 0", fontFamily: "var(--font-display)" }}>60% - 74%</div>
                            <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 700 }}>Steady Progress</span>
                          </div>

                          {/* Tier 3 */}
                          <div style={{ background: "var(--nb-cyan-light)", border: isTier3 ? "3.5px solid #000000" : "2px solid #000000", boxShadow: isTier3 ? "6px 6px 0px #000000" : "3px 3px 0px #000000", padding: "1.2rem 0.6rem", borderRadius: "10px", position: "relative" }}>
                            {isTier3 && (
                              <span className="nb-badge" style={{ position: "absolute", top: "-12px", right: "6px", background: "#000000", color: "var(--nb-yellow)", fontSize: "0.65rem" }}>
                                📍 {student.name} IS HERE
                              </span>
                            )}
                            <span className="nb-badge" style={{ background: "var(--nb-cyan)", color: "#000000", fontSize: "0.65rem" }}>Proficient</span>
                            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", margin: "0.4rem 0", fontFamily: "var(--font-display)" }}>75% - 89%</div>
                            <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 800 }}>High Achiever</span>
                          </div>

                          {/* Tier 4 */}
                          <div style={{ background: "var(--nb-lime-light)", border: isTier4 ? "3.5px solid #000000" : "2px solid #000000", boxShadow: isTier4 ? "6px 6px 0px #000000" : "3px 3px 0px #000000", padding: "1.2rem 0.6rem", borderRadius: "10px", position: "relative" }}>
                            {isTier4 && (
                              <span className="nb-badge" style={{ position: "absolute", top: "-12px", right: "6px", background: "#000000", color: "var(--nb-yellow)", fontSize: "0.65rem" }}>
                                📍 {student.name} IS HERE
                              </span>
                            )}
                            <span className="nb-badge" style={{ background: "var(--nb-lime)", color: "#000000", fontSize: "0.65rem" }}>Distinction</span>
                            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", margin: "0.4rem 0", fontFamily: "var(--font-display)" }}>90% - 100%</div>
                            <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 700 }}>Exemplary</span>
                          </div>

                        </div>
                      </div>

                      <div style={{ background: "var(--nb-yellow-light)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1.2rem 1.4rem", borderRadius: "10px" }}>
                        <h4 style={{ fontSize: "1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          🏆 Class Standing Summary:
                        </h4>
                        <p style={{ color: "#1e293b", fontSize: "0.95rem", marginTop: "0.3rem", lineHeight: 1.6, fontWeight: 600 }}>
                          With a cumulative average of <strong style={{ color: "#000000", background: "var(--nb-yellow)", padding: "0.1rem 0.4rem", border: "1.5px solid #000", borderRadius: "4px" }}>{avg}%</strong>, {student.name} ranks in the <strong>{tierLabel}</strong> quartile of the class. Focused encouragement in their key focus areas will comfortably elevate learning mastery!
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {/* ===================== CHART 7: SUBJECT MASTERY DONUT RING ===================== */}
            {(parentSubTab === "donut" || parentSubTab === "all") && (
              <div className="nb-card" style={{ padding: "1.8rem", marginBottom: "1.5rem" }}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                    ⭕ Subject Mastery Balance & Distribution Donut
                  </h3>
                  <p style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 600 }}>
                    Circular visualization showing the strength contribution of all subjects
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexWrap: "wrap", gap: "2rem" }}>
                  {/* Central Donut SVG */}
                  <div style={{ position: "relative", width: "220px", height: "220px" }}>
                    <svg viewBox="0 0 200 200" style={{ width: "220px", height: "220px" }}>
                      <circle cx="100" cy="100" r="75" fill="none" stroke="#f1f5f9" strokeWidth="24" />
                      {(() => {
                        const palette = ["#38bdf8", "#4ade80", "#fde047", "#c084fc", "#fb923c", "#f472b6", "#2dd4bf"]
                        const subList = Object.entries(student.scores)
                        const count = subList.length || 1
                        const circ = 2 * Math.PI * 75
                        const segmentLen = circ / count - 5

                        return subList.map(([_, scItem], i) => {
                          const offset = i * (circ / count)
                          return (
                            <circle
                              key={i}
                              cx="100"
                              cy="100"
                              r="75"
                              fill="none"
                              stroke={palette[i % palette.length]}
                              strokeWidth="22"
                              strokeDasharray={`${segmentLen} ${circ}`}
                              strokeDashoffset={-offset}
                              transform="rotate(-90 100 100)"
                            />
                          )
                        })
                      })()}
                    </svg>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ background: "var(--nb-yellow)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", borderRadius: "10px", padding: "0.4rem 0.8rem", textAlign: "center" }}>
                        <span style={{ fontSize: "1.7rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", display: "block", lineHeight: 1 }}>
                          {getStudentAverage(student)}%
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 800 }}>Cumulative</span>
                      </div>
                    </div>
                  </div>

                  {/* Subject Legend Badges */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", minWidth: "280px" }}>
                    {Object.entries(student.scores).map(([sub, scoreObj], idx) => {
                      const palette = ["#38bdf8", "#4ade80", "#fde047", "#c084fc", "#fb923c", "#f472b6", "#2dd4bf"]
                      const { score, outOf, percent } = getScoreDetails(scoreObj)
                      const color = palette[idx % palette.length]

                      return (
                        <div key={sub} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", border: "2px solid #000000", boxShadow: "2px 2px 0px #000000" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span style={{ width: "14px", height: "14px", borderRadius: "4px", background: color, border: "1.5px solid #000" }}></span>
                            <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#000000", fontFamily: "var(--font-display)" }}>{sub}</span>
                          </div>
                          <span className="nb-badge" style={{ background: color, color: "#000000" }}>
                            {score}/{outOf} ({percent}%)
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

        {/* ======================= VIEW: TEACHER MARKS & COMPARISON ======================= */}
        {mainView === "teacher" && (
          students.length === 0 ? (
            <div className="nb-card" style={{ padding: "2.5rem 2rem", background: "#ffffff", textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "var(--nb-yellow)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "0.3rem 0.8rem", borderRadius: "8px", fontWeight: 900, fontSize: "0.85rem", textTransform: "uppercase", marginBottom: "1rem" }}>
                👩‍🏫 Teacher Marks & Comparisons
              </div>

              <h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", margin: "0.3rem 0 0.8rem" }}>
                No Student Records in Roster
              </h2>

              <p style={{ maxWidth: "600px", margin: "0 auto 1.5rem", color: "#334155", fontSize: "0.95rem", lineHeight: 1.6, fontWeight: 600 }}>
                The gradebook is currently empty. Load our sample demo roster (with 2 students) to explore multi-student comparison graphs, or import your real classroom spreadsheet.
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleLoadDemoRoster}
                  className="nb-btn"
                  style={{ background: "var(--nb-yellow)", color: "#000000", padding: "0.75rem 1.4rem", fontSize: "0.95rem", fontWeight: 900 }}
                >
                  ✨ Load Demo Roster (2 Students)
                </button>
                <button
                  onClick={() => setShowDemoModal(true)}
                  className="nb-btn"
                  style={{ background: "var(--nb-cyan)", color: "#000000", padding: "0.75rem 1.2rem", fontSize: "0.95rem", fontWeight: 900 }}
                >
                  📖 Open Demo Guide
                </button>
                <button
                  onClick={handleOpenAddStudentModal}
                  className="nb-btn"
                  style={{ background: "var(--nb-lime)", color: "#000000", padding: "0.75rem 1.2rem", fontSize: "0.95rem", fontWeight: 900 }}
                >
                  + Add Student Details
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="nb-btn"
                  style={{ background: "#ffffff", color: "#000000", padding: "0.75rem 1.2rem", fontSize: "0.95rem", fontWeight: 900 }}
                >
                  📊 Import Excel / Sheets
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Header Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.2rem", marginBottom: "1.8rem" }}>
                <div className="nb-card" style={{ background: "#bae6fd", padding: "1.2rem" }}>
                  <span className="nb-badge" style={{ background: "#0284c7", color: "#ffffff", marginBottom: "0.4rem" }}>ENROLLMENT</span>
                  <h3 style={{ fontSize: "2.2rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>{students.length}</h3>
                  <span style={{ fontSize: "0.85rem", color: "#000000", fontWeight: 800 }}>Class 5 Section A</span>
                </div>

                <div className="nb-card" style={{ background: "#bbf7d0", padding: "1.2rem" }}>
                  <span className="nb-badge" style={{ background: "#16a34a", color: "#ffffff", marginBottom: "0.4rem" }}>CLASS AVERAGE</span>
                  <h3 style={{ fontSize: "2.2rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>{classOverallAverage}%</h3>
                  <span style={{ fontSize: "0.85rem", color: "#000000", fontWeight: 800 }}>Across {availableSubjects.length} subjects</span>
                </div>

                <div className="nb-card" style={{ background: "#fef08a", padding: "1.2rem" }}>
                  <span className="nb-badge" style={{ background: "#ca8a04", color: "#ffffff", marginBottom: "0.4rem" }}>SUBJECTS</span>
                  <h3 style={{ fontSize: "2.2rem", fontWeight: 900, color: "#000000", margin: "0.2rem 0", fontFamily: "var(--font-display)" }}>{availableSubjects.length}</h3>
                  <button
                    onClick={() => setShowAddSubjectModal(true)}
                    className="nb-btn"
                    style={{ background: "#ffffff", color: "#000000", fontSize: "0.75rem", padding: "0.25rem 0.6rem", marginTop: "0.2rem" }}
                  >
                    + Add Subject
                  </button>
                </div>

                <div className="nb-card" style={{ background: "#fed7aa", padding: "1.2rem" }}>
                  <span className="nb-badge" style={{ background: "#ea580c", color: "#ffffff", marginBottom: "0.4rem" }}>EXCEL / SHEETS</span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", margin: "0.4rem 0", fontFamily: "var(--font-display)" }}>SYNC READY</h3>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="nb-btn"
                    style={{ background: "#fde047", color: "#000000", fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                  >
                    Paste / Upload Marks
                  </button>
                </div>
              </div>

              {/* SIDE-BY-SIDE STUDENT COMPARISON */}
              <div className="nb-card" style={{ background: "#ffffff", padding: "1.5rem", marginBottom: "1.8rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem", borderBottom: "3px solid #000000", paddingBottom: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className="nb-badge" style={{ background: "#a855f7", color: "#ffffff" }}>ANALYSIS</span>
                      <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                        Multi-Student Comparative Graph (Marks & Out-Of)
                      </h3>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.2rem" }}>
                      Select two students to compare their exact scores, max marks, and scaled percentages
                    </p>
                  </div>

                  {students.length >= 2 && (
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 900, display: "block", marginBottom: "0.2rem", textTransform: "uppercase" }}>
                          Student 1 (Cyan)
                        </span>
                        <select
                          value={compareStudentA}
                          onChange={(e) => setCompareStudentA(e.target.value)}
                          className="nb-select"
                          style={{ background: "#bae6fd" }}
                        >
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({getStudentAverage(s)}%)
                            </option>
                          ))}
                        </select>
                      </div>

                      <span className="nb-badge" style={{ background: "#fde047", color: "#000000", fontSize: "0.9rem", fontWeight: 900, marginTop: "1.1rem" }}>
                        VS
                      </span>

                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 900, display: "block", marginBottom: "0.2rem", textTransform: "uppercase" }}>
                          Student 2 (Lime)
                        </span>
                        <select
                          value={compareStudentB}
                          onChange={(e) => setCompareStudentB(e.target.value)}
                          className="nb-select"
                          style={{ background: "#bbf7d0" }}
                        >
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({getStudentAverage(s)}%)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Comparative Bars */}
                {students.length < 2 ? (
                  <div style={{ background: "#fef9c3", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1.4rem", borderRadius: "10px", textAlign: "center" }}>
                    <h4 style={{ fontSize: "1.05rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      👥 Side-by-Side Comparison Requires at least 2 Students
                    </h4>
                    <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.3rem" }}>
                      Currently only 1 student is in the roster. Add another student or load our demo classmate to see live side-by-side comparative graphs.
                    </p>
                    <div style={{ display: "flex", justifyContent: "center", gap: "0.8rem", marginTop: "0.9rem" }}>
                      <button onClick={handleOpenAddStudentModal} className="nb-btn" style={{ background: "#38bdf8", color: "#000", fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
                        + Add Student
                      </button>
                      <button onClick={handleLoadDemoRoster} className="nb-btn" style={{ background: "var(--nb-yellow)", color: "#000", fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
                        ✨ Load 2-Student Demo Roster
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                    {availableSubjects.map((subject) => {
                      const detA = getScoreDetails(compA?.scores?.[subject])
                      const detB = getScoreDetails(compB?.scores?.[subject])
                      const classAvg = getClassSubjectAverage(subject)

                      return (
                        <div
                          key={subject}
                          style={{
                            background: "#fffbeb",
                            padding: "1rem 1.2rem",
                            borderRadius: "10px",
                            border: "2.5px solid #000000",
                            boxShadow: "3px 3px 0px #000000",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                            <span style={{ fontWeight: 900, fontSize: "1rem", color: "#000000", fontFamily: "var(--font-display)" }}>
                              {subject}
                            </span>
                            <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.85rem", flexWrap: "wrap" }}>
                              <span className="nb-badge" style={{ background: "#38bdf8", color: "#000000" }}>
                                {compA?.name || "Student 1"}: {detA.score}/{detA.outOf} ({detA.percent}%)
                              </span>
                              <span className="nb-badge" style={{ background: "#4ade80", color: "#000000" }}>
                                {compB?.name || "Student 2"}: {detB.score}/{detB.outOf} ({detB.percent}%)
                              </span>
                              <span className="nb-badge" style={{ background: "#e2e8f0", color: "#000000" }}>
                                Class Avg: {classAvg}%
                              </span>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            <div className="nb-progress-track" style={{ height: "14px", background: "#ffffff" }}>
                              <div
                                style={{
                                  width: `${Math.min(100, detA.percent)}%`,
                                  height: "100%",
                                  background: "#38bdf8",
                                  borderRight: "2px solid #000000",
                                }}
                              ></div>
                            </div>
                            <div className="nb-progress-track" style={{ height: "14px", background: "#ffffff" }}>
                              <div
                                style={{
                                  width: `${Math.min(100, detB.percent)}%`,
                                  height: "100%",
                                  background: "#4ade80",
                                  borderRight: "2px solid #000000",
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            {/* MASTER SPREADSHEET TABLE (SHOWCASING RAW MARKS & OUT OF) */}
            <div className="nb-card" style={{ background: "#ffffff", padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.2rem", borderBottom: "3px solid #000000", paddingBottom: "0.8rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span className="nb-badge" style={{ background: "#fde047", color: "#000000" }}>ROSTER</span>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                      Master Gradebook & Out-Of Roster ({students.length} Students)
                    </h3>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600, marginTop: "0.2rem" }}>
                    Displays exact marks scored out of total for each subject
                  </p>
                </div>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="nb-btn"
                  style={{ background: "#38bdf8", color: "#000000", fontSize: "0.85rem" }}
                >
                  📥 Import More From Excel / Sheets
                </button>
              </div>

              <div style={{ overflowX: "auto", border: "3px solid #000000", borderRadius: "10px", boxShadow: "4px 4px 0px #000000" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#fde047", borderBottom: "3px solid #000000" }}>
                      <th style={{ padding: "0.85rem 0.9rem", color: "#000000", fontWeight: 900, fontFamily: "var(--font-display)" }}>ROLL</th>
                      <th style={{ padding: "0.85rem 0.9rem", color: "#000000", fontWeight: 900, fontFamily: "var(--font-display)" }}>STUDENT NAME</th>
                      {availableSubjects.map((sub) => (
                        <th key={sub} style={{ padding: "0.85rem 0.9rem", color: "#000000", textAlign: "center", fontWeight: 900, fontFamily: "var(--font-display)" }}>
                          {sub}
                        </th>
                      ))}
                      <th style={{ padding: "0.85rem 0.9rem", color: "#000000", textAlign: "center", fontWeight: 900, fontFamily: "var(--font-display)" }}>AVERAGE</th>
                      <th style={{ padding: "0.85rem 0.9rem", color: "#000000", textAlign: "center", fontWeight: 900, fontFamily: "var(--font-display)" }}>ATTENDANCE</th>
                      <th style={{ padding: "0.85rem 0.9rem", color: "#000000", textAlign: "center", fontWeight: 900, fontFamily: "var(--font-display)" }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((st, idx) => {
                      const avg = getStudentAverage(st)
                      return (
                        <tr
                          key={st.id}
                          style={{
                            borderBottom: "2px solid #000000",
                            background: idx % 2 === 0 ? "#ffffff" : "#fefce8",
                          }}
                        >
                          <td style={{ padding: "0.75rem 0.9rem", fontWeight: 800, color: "#000000" }}>{st.code}</td>
                          <td style={{ padding: "0.75rem 0.9rem", fontWeight: 900, color: "#000000" }}>{st.name}</td>
                          {availableSubjects.map((sub) => {
                            const det = getScoreDetails(st.scores[sub])
                            const badgeColor = det.percent >= 80 ? "#4ade80" : det.percent >= 65 ? "#38bdf8" : "#f87171"
                            return (
                              <td key={sub} style={{ padding: "0.75rem 0.9rem", textAlign: "center" }}>
                                <span
                                  className="nb-badge"
                                  style={{
                                    background: badgeColor,
                                    color: "#000000",
                                    fontSize: "0.75rem",
                                    display: "inline-block",
                                  }}
                                >
                                  {det.score}/{det.outOf} ({det.percent}%)
                                </span>
                              </td>
                            )
                          })}
                          <td style={{ padding: "0.75rem 0.9rem", textAlign: "center" }}>
                            <span className="nb-badge" style={{ background: "#fde047", color: "#000000", fontWeight: 900 }}>
                              {avg}%
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 0.9rem", textAlign: "center", fontWeight: 800, color: "#000000" }}>
                            {st.attendanceRate}%
                          </td>
                          <td style={{ padding: "0.75rem 0.9rem", textAlign: "center" }}>
                            <button
                              onClick={() => {
                                setSelectedStudentId(st.id)
                                setMainView("parent")
                              }}
                              className="nb-btn"
                              style={{
                                background: "#bae6fd",
                                color: "#000000",
                                padding: "0.25rem 0.6rem",
                                fontSize: "0.75rem",
                              }}
                            >
                              View Card
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      </main>

      {/* ========================================================================= */}
      {/* MODAL: ADD STUDENT DETAILS (WITH ARBITRARY SUBJECTS & OUT-OF MARKS) */}
      {/* ========================================================================= */}
      {showAddStudentModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div className="nb-card" style={{ background: "#ffffff", maxWidth: "620px", width: "100%", padding: "1.8rem", maxHeight: "92vh", overflowY: "auto", boxShadow: "8px 8px 0px #000000" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", borderBottom: "3px solid #000000", paddingBottom: "0.8rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="nb-badge" style={{ background: "#4ade80", color: "#000" }}>NEW</span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                    + Add Student Details
                  </h3>
                </div>
                <p style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600, marginTop: "0.2rem" }}>
                  Add student profile and configure any number of subjects with custom "Out Of" marks
                </p>
              </div>
              <button
                onClick={() => setShowAddStudentModal(false)}
                className="nb-btn"
                style={{ background: "#f87171", color: "#000000", padding: "0.3rem 0.7rem", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStudent}>
              
              {/* Student Demographics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.8rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 900, color: "#000000", marginBottom: "0.3rem", textTransform: "uppercase" }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kavya Nair"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="nb-input"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 900, color: "#000000", marginBottom: "0.3rem", textTransform: "uppercase" }}>
                    Roll / Code
                  </label>
                  <input
                    type="text"
                    placeholder="EDU004"
                    value={newStudentCode}
                    onChange={(e) => setNewStudentCode(e.target.value)}
                    className="nb-input"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "1.2rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 900, color: "#000000", marginBottom: "0.3rem", textTransform: "uppercase" }}>
                    Class / Grade
                  </label>
                  <input
                    type="text"
                    value={newStudentGrade}
                    onChange={(e) => setNewStudentGrade(e.target.value)}
                    className="nb-input"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 900, color: "#000000", marginBottom: "0.3rem", textTransform: "uppercase" }}>
                    Section
                  </label>
                  <input
                    type="text"
                    value={newStudentSection}
                    onChange={(e) => setNewStudentSection(e.target.value)}
                    className="nb-input"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* DYNAMIC SUBJECTS LIST WITH "OUT OF" MARKS */}
              <div style={{ background: "#fef08a", padding: "1.2rem", borderRadius: "10px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", marginBottom: "1.2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem", color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                      Enter Marks for Subjects (Score & Out Of)
                    </strong>
                    <p style={{ fontSize: "0.75rem", color: "#334155", fontWeight: 600 }}>
                      Teachers can set any max marks (e.g. 50, 25, 80, 100) per subject
                    </p>
                  </div>
                  <span className="nb-badge" style={{ background: "#000000", color: "#ffffff" }}>
                    {modalSubjectRows.length} Subjects
                  </span>
                </div>

                {/* Subject Rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "240px", overflowY: "auto", paddingRight: "0.3rem" }}>
                  {modalSubjectRows.map((row) => {
                    const pct = row.outOf ? Math.round((row.score / row.outOf) * 100) : 0
                    return (
                      <div
                        key={row.subject}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "#ffffff",
                          padding: "0.6rem 0.8rem",
                          borderRadius: "8px",
                          border: "2px solid #000000",
                          boxShadow: "2px 2px 0px #000000",
                          gap: "0.6rem",
                        }}
                      >
                        {/* Subject Name */}
                        <div style={{ flex: 1.2, fontWeight: 900, fontSize: "0.9rem", color: "#000000", fontFamily: "var(--font-display)" }}>
                          {row.subject}
                        </div>

                        {/* Marks Scored Input */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 800 }}>Marks:</span>
                          <input
                            type="number"
                            min="0"
                            max={row.outOf || 100}
                            value={row.score}
                            onChange={(e) => handleUpdateSubjectRow(row.subject, "score", Number(e.target.value))}
                            className="nb-input"
                            style={{ width: "65px", padding: "0.35rem", textAlign: "center" }}
                            required
                          />
                        </div>

                        {/* "Out Of" Input */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "#000000", fontWeight: 800 }}>Out of:</span>
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={row.outOf}
                            onChange={(e) => handleUpdateSubjectRow(row.subject, "outOf", Number(e.target.value))}
                            className="nb-input"
                            style={{ width: "65px", padding: "0.35rem", textAlign: "center", background: "#fef9c3" }}
                            required
                          />
                        </div>

                        {/* Computed % Badge */}
                        <span
                          className="nb-badge"
                          style={{
                            background: pct >= 80 ? "#4ade80" : pct >= 65 ? "#38bdf8" : "#f87171",
                            color: "#000000",
                            minWidth: "50px",
                            textAlign: "center",
                          }}
                        >
                          {pct}%
                        </span>

                        {/* Delete Subject Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveSubjectInModal(row.subject)}
                          title="Remove subject"
                          className="nb-btn"
                          style={{ background: "#f87171", color: "#000000", padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* INLINE: ADD NEW SUBJECT RIGHT HERE IN THE MODAL */}
                <div style={{ marginTop: "1rem", borderTop: "2px dashed #000000", paddingTop: "0.8rem" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#000000", display: "block", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                    + Add Another Subject Right Here:
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      placeholder="e.g. Physics, Chemistry, Hindi, Art..."
                      value={customSubjectToAdd}
                      onChange={(e) => setCustomSubjectToAdd(e.target.value)}
                      className="nb-input"
                      style={{ flex: 1, minWidth: "140px", padding: "0.45rem", fontSize: "0.85rem" }}
                    />
                    <input
                      type="number"
                      placeholder="Score"
                      title="Initial Score"
                      value={customScoreToAdd}
                      onChange={(e) => setCustomScoreToAdd(Number(e.target.value))}
                      className="nb-input"
                      style={{ width: "65px", padding: "0.45rem", textAlign: "center", fontSize: "0.85rem" }}
                    />
                    <span style={{ color: "#000000", fontSize: "0.8rem", fontWeight: 800 }}>out of</span>
                    <input
                      type="number"
                      placeholder="Out of"
                      title="Out Of Total"
                      value={customOutOfToAdd}
                      onChange={(e) => setCustomOutOfToAdd(Number(e.target.value))}
                      className="nb-input"
                      style={{ width: "65px", padding: "0.45rem", textAlign: "center", fontSize: "0.85rem" }}
                    />
                    <button
                      type="button"
                      onClick={handleAddSubjectInModal}
                      className="nb-btn"
                      style={{ background: "#4ade80", color: "#000000", padding: "0.45rem 0.9rem", fontSize: "0.8rem" }}
                    >
                      + Add
                    </button>
                  </div>
                </div>

              </div>

              {/* Form Action Buttons */}
              <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="nb-btn"
                  style={{ background: "#f1f5f9", color: "#000000", padding: "0.6rem 1.2rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="nb-btn"
                  style={{ background: "#fde047", color: "#000000", padding: "0.6rem 1.4rem" }}
                >
                  Save Student
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD GLOBAL SUBJECT */}
      {/* ========================================================================= */}
      {showAddSubjectModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div className="nb-card" style={{ background: "#ffffff", maxWidth: "440px", width: "100%", padding: "1.8rem", boxShadow: "8px 8px 0px #000000" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", borderBottom: "3px solid #000000", paddingBottom: "0.8rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="nb-badge" style={{ background: "#fde047", color: "#000" }}>SUBJECT</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                  + Add Global Subject
                </h3>
              </div>
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="nb-btn"
                style={{ background: "#f87171", color: "#000000", padding: "0.25rem 0.6rem" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddGlobalSubject}>
              <div style={{ marginBottom: "1.2rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 900, color: "#000000", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                  Subject Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physics, Chemistry, French, Biology, Art"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="nb-input"
                  style={{ width: "100%", padding: "0.6rem" }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(false)}
                  className="nb-btn"
                  style={{ background: "#f1f5f9", color: "#000000", padding: "0.6rem 1.2rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="nb-btn"
                  style={{ background: "#4ade80", color: "#000000", padding: "0.6rem 1.4rem" }}
                >
                  Add Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DIRECT EXCEL / SHEETS FILE UPLOAD & ANALYTICS */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: "1rem" }}>
          <div className="nb-card" style={{ background: "#ffffff", maxWidth: "780px", width: "100%", padding: "1.8rem", maxHeight: "92vh", overflowY: "auto", boxShadow: "10px 10px 0px #000000" }}>
            
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", borderBottom: "3px solid #000000", paddingBottom: "0.8rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="nb-badge" style={{ background: "#38bdf8", color: "#000" }}>EXCEL ANALYTICS</span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
                    Import & Analyze Excel Spreadsheet
                  </h3>
                </div>
                <p style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600, marginTop: "0.25rem" }}>
                  Directly upload <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> files. Automatically recognizes student names, roll numbers, and flexible "Out Of" test marks (e.g. 45/50, 88/100).
                </p>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false)
                  setExcelAnalysisResult(null)
                  setUploadedFile(null)
                }}
                className="nb-btn"
                style={{ background: "#f87171", color: "#000000", padding: "0.25rem 0.6rem" }}
              >
                ✕
              </button>
            </div>

            {/* Notification Banner */}
            {importNotification && (
              <div
                className="nb-card"
                style={{
                  background: importNotification.includes("Success") ? "#bbf7d0" : "#fee2e2",
                  color: "#000000",
                  padding: "0.6rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  border: "2px solid #000000",
                }}
              >
                {importNotification}
              </div>
            )}

            {/* Mode Tabs */}
            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.2rem", borderBottom: "2.5px solid #000000", paddingBottom: "0.6rem" }}>
              <button
                type="button"
                onClick={() => setImportTab("upload")}
                className="nb-btn"
                style={{
                  background: importTab === "upload" ? "var(--nb-yellow)" : "#ffffff",
                  color: "#000000",
                  padding: "0.45rem 1rem",
                  fontSize: "0.85rem",
                  fontWeight: 900,
                }}
              >
                📁 Direct File Upload (.xlsx, .xls, .csv)
              </button>
              <button
                type="button"
                onClick={() => setImportTab("paste")}
                className="nb-btn"
                style={{
                  background: importTab === "paste" ? "var(--nb-yellow)" : "#ffffff",
                  color: "#000000",
                  padding: "0.45rem 1rem",
                  fontSize: "0.85rem",
                  fontWeight: 900,
                }}
              >
                📋 Paste from Clipboard / Sheets
              </button>
            </div>

            {/* TAB 1: DIRECT FILE UPLOAD */}
            {importTab === "upload" && (
              <div>
                {!excelAnalysisResult && !isAnalyzingFile && (
                  <div>
                    {/* Drag & Drop Zone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragActive(true)
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragActive(false)
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileSelect(e.dataTransfer.files[0])
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: `3px dashed ${dragActive ? "var(--nb-lime)" : "#000000"}`,
                        background: dragActive ? "#f0fdf4" : "#fafafa",
                        borderRadius: "12px",
                        padding: "2.4rem 1.5rem",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        marginBottom: "1rem",
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,.tsv,.txt"
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        style={{ display: "none" }}
                      />
                      <div style={{ fontSize: "2.8rem", marginBottom: "0.5rem" }}>📗</div>
                      <h4 style={{ fontSize: "1.15rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", margin: "0 0 0.3rem" }}>
                        Click to Browse or Drag & Drop Excel File
                      </h4>
                      <p style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600, margin: "0 0 1.2rem" }}>
                        Supports <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> files.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                        className="nb-btn"
                        style={{ background: "var(--nb-cyan)", color: "#000000", padding: "0.5rem 1.2rem", fontSize: "0.85rem", fontWeight: 900 }}
                      >
                        📂 Choose Excel File
                      </button>
                    </div>

                    {/* Quick Starter Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem", background: "#f8fafc", padding: "0.8rem 1rem", borderRadius: "10px", border: "2px solid #000000" }}>
                      <div>
                        <span style={{ fontSize: "0.85rem", fontWeight: 900, color: "#000000", display: "block" }}>
                          Need an Excel test sheet?
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                          Download our ready-made template or load it directly for instant analysis.
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={handleDownloadSampleExcel}
                          className="nb-btn"
                          style={{ background: "#ffffff", color: "#000000", padding: "0.35rem 0.75rem", fontSize: "0.75rem", fontWeight: 800 }}
                        >
                          📥 Download Sample .xlsx
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadSampleIntoUploader}
                          className="nb-btn"
                          style={{ background: "var(--nb-yellow)", color: "#000000", padding: "0.35rem 0.75rem", fontSize: "0.75rem", fontWeight: 800 }}
                        >
                          ⚡ Quick Try Sample Data
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {isAnalyzingFile && (
                  <div style={{ padding: "2.5rem 1rem", textAlign: "center", background: "#f8fafc", borderRadius: "12px", border: "2.5px solid #000000", marginBottom: "1rem" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "0.6rem" }}>⚙️</div>
                    <h4 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      Analyzing Excel Structure & Calculating Scores...
                    </h4>
                    <p style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginTop: "0.3rem" }}>
                      Extracting student names, normalizing flexible out-of marks, and computing class analytics.
                    </p>
                  </div>
                )}

                {/* Analysis Ready */}
                {excelAnalysisResult && (
                  <div>
                    {/* File Header Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem", background: "#f8fafc", border: "2px solid #000000", borderRadius: "8px", padding: "0.6rem 0.9rem", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.2rem" }}>📄</span>
                        <div>
                          <span style={{ fontWeight: 900, fontSize: "0.85rem", color: "#000000", display: "block" }}>
                            {uploadedFile?.name || "Uploaded Spreadsheet"}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>
                            {uploadedFile?.size ? (uploadedFile.size / 1024).toFixed(1) + " KB" : "Worksheet ready"}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        {excelAnalysisResult.sheetNames.length > 1 && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 800 }}>Sheet:</span>
                            <select
                              value={selectedWorksheet}
                              onChange={(e) => handleWorksheetChange(e.target.value)}
                              className="nb-input"
                              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            >
                              {excelAnalysisResult.sheetNames.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setExcelAnalysisResult(null)
                            setUploadedFile(null)
                          }}
                          className="nb-btn"
                          style={{ background: "#ffffff", color: "#000000", padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                        >
                          🔄 Upload Different File
                        </button>
                      </div>
                    </div>

                    {/* Pre-Import Analytical Metrics */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
                      <div className="nb-card" style={{ background: "#bae6fd", padding: "0.8rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#0369a1", textTransform: "uppercase" }}>STUDENTS</span>
                        <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          {excelAnalysisResult.analysis.totalStudents}
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "#000000", fontWeight: 700 }}>Ready to import</span>
                      </div>
                      <div className="nb-card" style={{ background: "#bbf7d0", padding: "0.8rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#15803d", textTransform: "uppercase" }}>CLASS AVERAGE</span>
                        <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          {excelAnalysisResult.analysis.classAverage}%
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "#000000", fontWeight: 700 }}>Normalized Mean</span>
                      </div>
                      <div className="nb-card" style={{ background: "#fef08a", padding: "0.8rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#854d0e", textTransform: "uppercase" }}>CLASS TOPPER</span>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {excelAnalysisResult.analysis.topStudentName}
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "#000000", fontWeight: 700 }}>Score: {excelAnalysisResult.analysis.topStudentScore}%</span>
                      </div>
                      <div className="nb-card" style={{ background: "#fed7aa", padding: "0.8rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#c2410c", textTransform: "uppercase" }}>STANDOUT SUBJECT</span>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {excelAnalysisResult.analysis.highestSubject}
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "#000000", fontWeight: 700 }}>{excelAnalysisResult.analysis.subjectCount} subjects total</span>
                      </div>
                    </div>

                    {/* Diagnostic Summary Note */}
                    <div style={{ background: "#eff6ff", border: "2px solid #000000", borderRadius: "8px", padding: "0.6rem 0.8rem", marginBottom: "1rem", fontSize: "0.8rem", color: "#1e3a8a", fontWeight: 700 }}>
                      💡 <strong>Analysis Engine:</strong> Identified {excelAnalysisResult.subjects.length} subjects ({excelAnalysisResult.subjects.join(", ")}). Tests with custom total marks (e.g. out of 50 vs. 100) are automatically preserved in raw score cards and normalized for all 7 radar & benchmark graphs.
                    </div>

                    {/* Extracted Data Live Preview Table */}
                    <div style={{ marginBottom: "1.2rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#000000", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>
                        Live Data Preview (First {Math.min(5, excelAnalysisResult.students.length)} Students):
                      </span>
                      <div style={{ overflowX: "auto", border: "2.5px solid #000000", borderRadius: "8px", background: "#ffffff" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                          <thead>
                            <tr style={{ background: "var(--nb-yellow)", borderBottom: "2px solid #000000" }}>
                              <th style={{ padding: "0.5rem 0.7rem", fontWeight: 900 }}>Roll</th>
                              <th style={{ padding: "0.5rem 0.7rem", fontWeight: 900 }}>Student Name</th>
                              <th style={{ padding: "0.5rem 0.7rem", fontWeight: 900 }}>Attendance</th>
                              {excelAnalysisResult.subjects.slice(0, 4).map((sub) => (
                                <th key={sub} style={{ padding: "0.5rem 0.7rem", fontWeight: 900 }}>{sub}</th>
                              ))}
                              <th style={{ padding: "0.5rem 0.7rem", fontWeight: 900 }}>Diagnostic Teacher Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {excelAnalysisResult.students.slice(0, 5).map((s, idx) => (
                              <tr key={s.id} style={{ borderBottom: idx < 4 ? "1px solid #e2e8f0" : "none" }}>
                                <td style={{ padding: "0.45rem 0.7rem", fontWeight: 800, fontFamily: "monospace" }}>{s.code}</td>
                                <td style={{ padding: "0.45rem 0.7rem", fontWeight: 800 }}>{s.name}</td>
                                <td style={{ padding: "0.45rem 0.7rem", fontWeight: 700 }}>{s.attendanceRate}%</td>
                                {excelAnalysisResult.subjects.slice(0, 4).map((sub) => {
                                  const scoreItem = s.scores[sub]
                                  return (
                                    <td key={sub} style={{ padding: "0.45rem 0.7rem" }}>
                                      {scoreItem ? (
                                        <span className="nb-badge" style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "0.75rem", padding: "0.15rem 0.4rem" }}>
                                          {scoreItem.score}/{scoreItem.outOf}
                                        </span>
                                      ) : "-"}
                                    </td>
                                  )
                                })}
                                <td style={{ padding: "0.45rem 0.7rem", fontSize: "0.72rem", color: "#475569", maxWidth: "220px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {s.teacherNote}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PASTE SPREADSHEET ROWS */}
            {importTab === "paste" && (
              <div>
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 900, color: "#000000", textTransform: "uppercase" }}>
                      Paste Spreadsheet Rows (Tab-separated or Comma-separated)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPasteDataText(sampleExcelData)
                        handleParsePastedData()
                      }}
                      className="nb-btn"
                      style={{ background: "#fef08a", color: "#000000", padding: "0.2rem 0.5rem", fontSize: "0.75rem", fontWeight: 800 }}
                    >
                      Load Sample Data with "45/50"
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    placeholder={"Student Name\tRoll Number\tMathematics (50)\tScience (50)\tEnglish (100)\tAttendance\nRahul\tEDU004\t45/50\t40/50\t88/100\t95%"}
                    value={pasteDataText}
                    onChange={(e) => setPasteDataText(e.target.value)}
                    className="nb-input"
                    style={{ width: "100%", padding: "0.6rem", fontSize: "0.85rem", fontFamily: "monospace" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      onClick={handleParsePastedData}
                      className="nb-btn"
                      style={{ background: "var(--nb-cyan)", color: "#000000", padding: "0.35rem 0.8rem", fontSize: "0.8rem", fontWeight: 800 }}
                    >
                      ⚡ Analyze Pasted Data
                    </button>
                  </div>
                </div>

                {/* If analyzed from paste */}
                {excelAnalysisResult && (
                  <div>
                    {/* Pre-Import Analytical Metrics */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
                      <div className="nb-card" style={{ background: "#bae6fd", padding: "0.7rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#0369a1", textTransform: "uppercase" }}>STUDENTS</span>
                        <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          {excelAnalysisResult.analysis.totalStudents}
                        </div>
                      </div>
                      <div className="nb-card" style={{ background: "#bbf7d0", padding: "0.7rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#15803d", textTransform: "uppercase" }}>CLASS AVERAGE</span>
                        <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          {excelAnalysisResult.analysis.classAverage}%
                        </div>
                      </div>
                      <div className="nb-card" style={{ background: "#fef08a", padding: "0.7rem", textAlign: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#854d0e", textTransform: "uppercase" }}>TOPPER</span>
                        <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                          {excelAnalysisResult.analysis.topStudentName}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Bottom Action Footer */}
            <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end", borderTop: "3px solid #000000", paddingTop: "1rem", marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false)
                  setExcelAnalysisResult(null)
                  setUploadedFile(null)
                }}
                className="nb-btn"
                style={{ background: "#f1f5f9", color: "#000000", padding: "0.6rem 1.2rem", fontWeight: 800 }}
              >
                Cancel
              </button>

              {excelAnalysisResult ? (
                <button
                  type="button"
                  onClick={handleApplyAnalysisImport}
                  className="nb-btn"
                  style={{
                    background: "var(--nb-lime)",
                    color: "#000000",
                    padding: "0.7rem 1.6rem",
                    fontSize: "0.95rem",
                    fontWeight: 900,
                  }}
                >
                  🚀 Analyze & Load All {excelAnalysisResult.students.length} Students
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="nb-btn"
                  style={{
                    background: "var(--nb-yellow)",
                    color: "#000000",
                    padding: "0.7rem 1.4rem",
                    fontSize: "0.95rem",
                    fontWeight: 900,
                  }}
                >
                  📂 Select Excel File to Analyze
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INTERACTIVE DEMO GUIDE (ONE STANDARDIZED DEMO DATA PROFILE) */}
      {/* ========================================================================= */}
      {showDemoModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: "1rem" }}>
          <div className="nb-card" style={{ background: "#ffffff", maxWidth: "720px", width: "100%", padding: "1.8rem", maxHeight: "92vh", overflowY: "auto", boxShadow: "10px 10px 0px #000000" }}>
            
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", borderBottom: "3px solid #000000", paddingBottom: "0.8rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="nb-badge" style={{ background: "var(--nb-yellow)", color: "#000000", fontSize: "0.75rem" }}>
                    GUIDED DEMO WALKTHROUGH
                  </span>
                  <span className="nb-badge" style={{ background: "#000000", color: "#fde047", fontSize: "0.75rem" }}>
                    TYPE 1: PRIMARY / MIDDLE SCHOOL REPORT
                  </span>
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase", marginTop: "0.3rem" }}>
                  ✨ EduDrishti Demo Data Guide
                </h2>
              </div>
              <button
                onClick={() => setShowDemoModal(false)}
                className="nb-btn"
                style={{ background: "#f87171", color: "#000000", padding: "0.3rem 0.7rem", fontSize: "0.9rem" }}
              >
                ✕
              </button>
            </div>

            {/* Explanation Intro */}
            <div style={{ background: "var(--nb-yellow-light)", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", padding: "1rem 1.2rem", borderRadius: "10px", marginBottom: "1.2rem", fontSize: "0.9rem", color: "#1e293b", lineHeight: 1.6, fontWeight: 600 }}>
              💡 <strong>How this Demo Data works:</strong> The site starts clean without hardcoded mock data. This guided demo demonstrates <strong>Type 1: Continuous Assessment Report Card</strong>. It highlights EduDrishti's ability to handle tests with <strong>different total marks (e.g. 50 vs 100)</strong>, automatically translating raw scores into standardized analytics without losing original marks.
            </div>

            {/* Student Profile Card Preview */}
            <div style={{ border: "2.5px solid #000000", borderRadius: "10px", padding: "1.2rem", background: "#f8fafc", boxShadow: "4px 4px 0px #000000", marginBottom: "1.2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem", marginBottom: "0.8rem", borderBottom: "2px solid #e2e8f0", paddingBottom: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: "var(--nb-pink)", border: "2px solid #000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "1.4rem" }}>
                    A
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)" }}>
                      {DEMO_STUDENT.name}
                    </h3>
                    <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 700 }}>
                      Roll: {DEMO_STUDENT.code} • {DEMO_STUDENT.grade} - Section {DEMO_STUDENT.section} • {DEMO_STUDENT.school}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="nb-badge" style={{ background: "var(--nb-lime)", color: "#000" }}>
                    Attendance: {DEMO_STUDENT.attendanceRate}%
                  </span>
                  <span className="nb-badge" style={{ background: "var(--nb-cyan)", color: "#000" }}>
                    Assignments: {DEMO_STUDENT.assignmentCompletion}%
                  </span>
                </div>
              </div>

              {/* Subject Breakdown Table with Out-Of Highlight */}
              <div style={{ overflowX: "auto", marginBottom: "0.8rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--nb-yellow)", borderBottom: "2px solid #000000" }}>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "left", fontWeight: 900 }}>Subject</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 900 }}>Raw Score</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 900 }}>Total Marks</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 900 }}>Scaled %</th>
                      <th style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 900 }}>Status Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(DEMO_STUDENT.scores).map(([sub, scObj], idx) => {
                      const { score, outOf, percent } = getScoreDetails(scObj)
                      const isHigh = percent >= 85
                      return (
                        <tr key={sub} style={{ borderBottom: "1.5px solid #cbd5e1", background: idx % 2 === 0 ? "#ffffff" : "#fefce8" }}>
                          <td style={{ padding: "0.5rem 0.7rem", fontWeight: 800, color: "#000" }}>{sub}</td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 900, color: "#000" }}>{score}</td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 800, color: "#475569" }}>{outOf}</td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center" }}>
                            <span className="nb-badge" style={{ background: isHigh ? "var(--nb-lime)" : "var(--nb-cyan)", color: "#000", fontWeight: 900 }}>
                              {percent}%
                            </span>
                          </td>
                          <td style={{ padding: "0.5rem 0.7rem", textAlign: "center", fontWeight: 700, fontSize: "0.75rem" }}>
                            {percent >= 90 ? "🌟 Distinction" : percent >= 80 ? "🚀 High Achiever" : "📚 Proficient"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Exam Progression */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", border: "2px solid #000000", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 900, textTransform: "uppercase" }}>
                  📈 Exam Progression:
                </span>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {DEMO_STUDENT.examHistory.map((ex) => (
                    <span key={ex.examName} className="nb-badge" style={{ background: "var(--nb-yellow-light)", color: "#000", border: "1.5px solid #000" }}>
                      {ex.examName}: <strong>{ex.score}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* What you can explore with this demo */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 900, color: "#000000", fontFamily: "var(--font-display)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                🔍 What you will experience upon loading:
              </h4>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", color: "#334155", fontWeight: 600, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <li><strong>7 Visual Charts:</strong> Subject progress bars, class benchmark comparisons, multi-axial radar spider web, marks scored vs missed gap breakdown, sequential exam growth curve, bell-curve quartiles, and donut mastery ring.</li>
                <li><strong>Voice Summary Readout:</strong> Listen to real-time speech narration of the student's progress with clear spoken summaries.</li>
                <li><strong>Teacher Roster & Comparison:</strong> Load with classmate to compare two students side-by-side with scalable visual metrics.</li>
              </ul>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end", flexWrap: "wrap", borderTop: "3px solid #000000", paddingTop: "1rem" }}>
              {students.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="nb-btn"
                  style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.6rem 1rem", fontSize: "0.85rem", fontWeight: 800 }}
                >
                  🗑️ Clear Current Data
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(sampleExcelData)
                  showToast("📋 Copied sample spreadsheet template to clipboard!")
                }}
                className="nb-btn"
                style={{ background: "#f1f5f9", color: "#000000", padding: "0.6rem 1rem", fontSize: "0.85rem", fontWeight: 800 }}
              >
                📋 Copy Spreadsheet Template
              </button>

              <button
                type="button"
                onClick={handleLoadDemoStudent}
                className="nb-btn"
                style={{ background: "var(--nb-yellow)", color: "#000000", padding: "0.6rem 1.4rem", fontSize: "0.85rem", fontWeight: 900 }}
              >
                🚀 Load Single Demo Student
              </button>

              <button
                type="button"
                onClick={handleLoadDemoRoster}
                className="nb-btn"
                style={{ background: "var(--nb-lime)", color: "#000000", padding: "0.6rem 1.4rem", fontSize: "0.85rem", fontWeight: 900 }}
              >
                👥 Load With Classmate (For Teacher View)
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ background: "#fde047", borderTop: "3px solid #000000", padding: "1.2rem", textAlign: "center", color: "#000000", fontSize: "0.85rem", fontWeight: 800, marginTop: "auto", fontFamily: "var(--font-display)" }}>
        ⚡ EduDrishti + LearnPulse • Neo-Brutalist Student Learning Intelligence Platform
      </footer>
    </div>
  )
}