import { useState, useEffect } from "react";
import { Bell, Calendar, BarChart, BookOpen, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { sendWhatsAppNotification, useGeminiAI } from "@/utils/apiService";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import GenerateExamTab from "./tabs/GenerateExamTab";
import PerformanceTab from "./tabs/PerformanceTab";
import PreviousExamsTab from "./tabs/PreviousExamsTab";
import UpcomingExamsTab from "./tabs/UpcomingExamsTab";
import { IExamResult } from "./tabs/PerformanceTab";

export interface IExam {
  id?: string;
  name: string;
  date: string;
  time: string;
  duration: string;
  numberOfQuestions: string;
  topics: string[];
  difficulty: string;
  questionTypes: string;
  isActive?: boolean;
  questions?: string;
  sections?: any[];
  questionWeights?: Record<number, number>;
  questionTypeConfig?: Record<string, number>; // New field for question type configuration
  questionDistribution?: Record<string, number>; // Added this property to fix the error
  created_at?: string; // Add this field to resolve property access issue
  created?: string; // Add this property since it's used in GenerateExamTab.tsx
}

const ExamTabs = () => {
  const [activeTab, setActiveTab] = useState<string>("generate");
  const [generatedExam, setGeneratedExam] = useState<IExam | null>(null);
  const [upcomingExams, setUpcomingExams] = useState<IExam[]>([]);
  const [previousExams, setPreviousExams] = useState<IExam[]>([]);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [isNotifying, setIsNotifying] = useState<boolean>(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState<boolean>(false);
  const [selectedExam, setSelectedExam] = useState<IExam | null>(null);
  const [isWhatsAppSetup, setIsWhatsAppSetup] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const { toast } = useToast();
  
  // Load exams and phone number from localStorage on component mount
  useEffect(() => {
    const savedExams = localStorage.getItem('upcomingExams');
    if (savedExams) {
      try {
        setUpcomingExams(JSON.parse(savedExams));
      } catch (error) {
        console.error('Error parsing saved exams:', error);
      }
    }
    
    const savedPrevExams = localStorage.getItem('previousExams');
    if (savedPrevExams) {
      try {
        setPreviousExams(JSON.parse(savedPrevExams));
      } catch (error) {
        console.error('Error parsing saved previous exams:', error);
      }
    }
    
    // Load phone number if saved
    const savedPhoneNumber = localStorage.getItem('whatsappNumber');
    if (savedPhoneNumber) {
      setPhoneNumber(savedPhoneNumber);
      setIsWhatsAppSetup(true);
    }
  }, []);
  
  // Save exams to localStorage when they change
  useEffect(() => {
    if (upcomingExams.length > 0) {
      localStorage.setItem('upcomingExams', JSON.stringify(upcomingExams));
    }
  }, [upcomingExams]);

  // Save previous exams to localStorage when they change
  useEffect(() => {
    if (previousExams.length > 0) {
      localStorage.setItem('previousExams', JSON.stringify(previousExams));
    }
  }, [previousExams]);

  // Save phone number to localStorage when it changes
  useEffect(() => {
    if (phoneNumber && phoneNumber.length > 5) {
      localStorage.setItem('whatsappNumber', phoneNumber);
      setIsWhatsAppSetup(true);
    }
  }, [phoneNumber]);
  
  // Check for exams that need to be activated
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      
      // Check each exam if it's time to activate it
      const updatedExams = upcomingExams.map(exam => {
        if (!exam.isActive) {
          const examDateTime = new Date(`${exam.date}T${exam.time}`);
          
          if (examDateTime <= now) {
            // It's time to activate this exam!
            // Send a WhatsApp notification if phone number is available
            if (phoneNumber && phoneNumber.length > 5) {
              console.log("Sending WhatsApp notification for exam activation:", exam.name);
              sendWhatsAppNotification(
                phoneNumber,
                `Your exam "${exam.name}" is now available to take!`
              ).then(result => {
                console.log("WhatsApp notification result:", result);
                if (!result.success) {
                  toast({
                    title: "Notification Error",
                    description: "Could not send WhatsApp notification. Please check your phone number.",
                    variant: "destructive",
                  });
                }
              }).catch(err => console.error("Failed to send WhatsApp notification:", err));
            }
            
            toast({
              title: "Exam Available",
              description: `${exam.name} is now available to take`,
            });
            
            return { ...exam, isActive: true };
          }
        }
        return exam;
      });
      
      // Update the exams list if there are changes
      const hasChanges = updatedExams.some(
        (exam, i) => exam.isActive !== upcomingExams[i].isActive
      );
      
      if (hasChanges) {
        setUpcomingExams(updatedExams);
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [upcomingExams]);
  
  // Listen for exam completion events from the exam window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      console.log("Received message from exam window:", event.data);
      if (event.data?.type === 'examCompleted' && event.data.examData) {
        console.log("Processing completed exam from message:", event.data.examData);
        await processCompletedExam(event.data.examData);
      }
    };
    
    // Check the localStorage for a completed exam ID on component mount
    const checkCompletedExam = async () => {
      const completedExamId = localStorage.getItem('completedExamId');
      console.log("Checking for completed exam:", completedExamId);
      
      if (completedExamId) {
        const lastExamResults = localStorage.getItem('lastExamResults');
        if (lastExamResults) {
          try {
            console.log("Found last exam results in localStorage:", lastExamResults);
            const examData = JSON.parse(lastExamResults) as IExamResult;
            await processCompletedExam(examData);
            localStorage.removeItem('completedExamId');
            localStorage.removeItem('lastExamResults');
          } catch (error) {
            console.error('Error processing completed exam:', error);
          }
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    console.log("Setting up exam completion listener");
    checkCompletedExam();
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [upcomingExams]);
  
  // Process a completed exam - NOW USING GEMINI AI
  const processCompletedExam = async (examData: IExamResult) => {
    console.log("Processing completed exam:", examData);
    // Find the exam in upcoming exams
    const examIndex = upcomingExams.findIndex(exam => exam.id === examData.examId);
    console.log("Found exam at index:", examIndex, "out of", upcomingExams.length, "exams");
    
    if (examIndex === -1) {
      console.error("Could not find exam with ID:", examData.examId);
      console.log("Available exams:", upcomingExams.map(e => e.id));
      return;
    }
    
    const completedExam = upcomingExams[examIndex];
    if (!completedExam) {
      console.error("Completed exam is null or undefined");
      return;
    }
    
    setIsEvaluating(true);
    toast({
      title: "Evaluating Exam",
      description: "Please wait while the AI evaluates your exam responses..."
    });
    
    try {
      console.log("Starting AI evaluation for exam:", completedExam.name);
      
      // Evaluate the exam using Gemini AI
      const evaluationResult = await useGeminiAI({
        task: "evaluate_answer",
        examData: {
          examId: examData.examId,
          examName: examData.examName,
          date: examData.date,
          timeTaken: examData.timeTaken,
          questions: examData.questions,
          answers: examData.answers,
          questionWeights: examData.questionWeights,
          topics: completedExam.topics,
          difficulty: completedExam.difficulty
        }
      });
      
      if (!evaluationResult.success || !evaluationResult.evaluationResult) {
        console.error("AI evaluation failed:", evaluationResult);
        throw new Error("Failed to evaluate exam responses");
      }
      
      console.log("Received AI evaluation result:", evaluationResult.evaluationResult);
      
      const examResult = evaluationResult.evaluationResult;
      
      console.log("Created exam result object:", examResult);
      
      // Move the exam from upcoming to previous
      console.log("Moving exam from upcoming to previous...");
      setPreviousExams(prev => [...prev, completedExam]);
      
      // Remove the exam from upcoming exams
      setUpcomingExams(prev => prev.filter(exam => exam.id !== completedExam.id));
      
      // Save updated exam lists to localStorage
      const updatedUpcomingExams = upcomingExams.filter(exam => exam.id !== completedExam.id);
      const updatedPreviousExams = [...previousExams, completedExam];
      
      localStorage.setItem('upcomingExams', JSON.stringify(updatedUpcomingExams));
      localStorage.setItem('previousExams', JSON.stringify(updatedPreviousExams));
      
      console.log("Exam successfully processed and moved to previous exams");
      
      toast({
        title: "Exam Evaluated",
        description: `You scored ${examResult.percentage}% on ${completedExam.name}`
      });
      
      // Switch to the performance tab to show results
      setActiveTab("performance");
      
    } catch (error) {
      console.error("Error evaluating exam:", error);
      toast({
        title: "Evaluation Error",
        description: "Failed to evaluate exam responses. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEvaluating(false);
    }
  };
  
  // Get saved exam results from localStorage for performance tab
  const getExamResults = () => {
    const savedResults = localStorage.getItem('examResults');
    const examResults = savedResults ? JSON.parse(savedResults) : [];
    return examResults;
  };

  // Prepare data for performance tab
  const prepareExamsWithResults = () => {
    const examResults = getExamResults();
    const examsWithResults = [];
    
    // Match exam results with the exams
    for (const result of examResults) {
      // Find the exam in previous exams
      const exam = previousExams.find(e => e.id === result.examId) || {
        id: result.examId,
        name: result.examName,
        date: result.date,
        time: "",
        duration: "",
        numberOfQuestions: "",
        topics: [],
        difficulty: "",
        questionTypes: "",
        created_at: result.date
      };
      
      examsWithResults.push({
        exam,
        result
      });
    }
    
    return examsWithResults;
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  // Handle saving an exam
  const handleSaveExam = (exam: IExam) => {
    // Set some defaults if missing
    const currentDate = new Date();
    const examDate = exam.date || new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const examTime = exam.time || currentDate.toTimeString().slice(0, 5);
    
    const newExam = {
      ...exam,
      id: `exam-${Date.now()}`, // Simple ID for tracking
      date: examDate,
      time: examTime,
      isActive: false, // Initially not active - exams can only be taken after scheduled time
      questionWeights: exam.questionWeights || {} // Store question weightages
    };
    
    setUpcomingExams([...upcomingExams, newExam]);
    setGeneratedExam(null);
    
    // Automatically switch to upcoming tab
    setActiveTab("upcoming");
    
    toast({
      title: "Exam Saved",
      description: "The exam has been moved to upcoming exams"
    });
  };
  
  // Handle WhatsApp notification sending
  const handleSendReminder = async () => {
    if (!selectedExam) return;
    
    if (!phoneNumber || phoneNumber.length < 5) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number with country code",
        variant: "destructive",
      });
      return;
    }
    
    setIsNotifying(true);
    
    try {
      console.log("Sending WhatsApp reminder for exam:", selectedExam.name);
      
      // Format the message
      const message = `Reminder: Your exam "${selectedExam.name}" is scheduled for ${selectedExam.date} at ${selectedExam.time}. The exam will be ${selectedExam.duration} minutes long. Good luck!`;
      
      // Send the WhatsApp notification
      const result = await sendWhatsAppNotification(phoneNumber, message);
      
      if (result.success) {
        toast({
          title: "Reminder Sent",
          description: "WhatsApp reminder sent successfully!",
        });
        setIsWhatsAppSetup(true);
      } else {
        console.error("Failed to send WhatsApp reminder:", result.error);
        toast({
          title: "Error",
          description: "Failed to send WhatsApp reminder. Check console for details.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      toast({
        title: "Error",
        description: "Failed to send WhatsApp reminder",
        variant: "destructive",
      });
    } finally {
      setIsNotifying(false);
      setNotificationDialogOpen(false);
    }
  };
  
  // Open notification dialog for a specific exam
  const openNotificationDialog = (exam: IExam) => {
    setSelectedExam(exam);
    setNotificationDialogOpen(true);
  };
  
  // Add delete exam functionality
  const handleDeleteExam = (examId: string) => {
    // Filter out the exam with the specified ID
    const updatedExams = upcomingExams.filter(exam => exam.id !== examId);
    setUpcomingExams(updatedExams);
    
    // Save the updated exams to localStorage
    localStorage.setItem('upcomingExams', JSON.stringify(updatedExams));
  };
  
  // Handle deleting a previous exam
  const handleDeletePreviousExam = (examId: string) => {
    console.log("Deleting previous exam with ID:", examId);
    
    // Filter out the exam with the specified ID
    const updatedExams = previousExams.filter(exam => exam.id !== examId);
    setPreviousExams(updatedExams);
    
    // Save the updated exams to localStorage
    localStorage.setItem('previousExams', JSON.stringify(updatedExams));
    
    // Also remove from exam results if it exists there
    const savedResults = localStorage.getItem('examResults');
    if (savedResults) {
      try {
        const examResults = JSON.parse(savedResults);
        const updatedResults = examResults.filter(result => result.examId !== examId);
        localStorage.setItem('examResults', JSON.stringify(updatedResults));
      } catch (error) {
        console.error('Error updating exam results:', error);
      }
    }
    
    toast({
      title: "Exam Deleted",
      description: "The exam has been removed from your history",
    });
  };
  
  // Handle deleting an exam result
  const handleDeleteExamResult = (examId: string) => {
    console.log("Deleting exam result with ID:", examId);
    
    // Get exam results from localStorage
    const savedResults = localStorage.getItem('examResults');
    if (savedResults) {
      try {
        // Parse stored results
        const examResults = JSON.parse(savedResults);
        
        // Filter out the exam to delete
        const updatedResults = examResults.filter(result => result.examId !== examId);
        
        // Save updated results back to localStorage
        localStorage.setItem('examResults', JSON.stringify(updatedResults));
        
        toast({
          title: "Exam Result Deleted",
          description: "The exam result has been removed from your performance history",
        });
        
        // Force a re-render by updating state
        setActiveTab("performance");
      } catch (error) {
        console.error('Error deleting exam result:', error);
        toast({
          title: "Delete Failed",
          description: "Could not delete the exam result. Please try again.",
          variant: "destructive",
        });
      }
    }
  };
  
  return (
    <>
      <Tabs defaultValue="generate" className="space-y-6" value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <TabsTrigger value="generate" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BookOpen className="h-4 w-4 mr-2" /> Generate Exam
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart className="h-4 w-4 mr-2" /> Performance
          </TabsTrigger>
          <TabsTrigger value="previous" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4 mr-2" /> Previous Exams
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Calendar className="h-4 w-4 mr-2" /> Upcoming
          </TabsTrigger>
        </TabsList>
        
        {/* Generate Exam Tab */}
        <TabsContent value="generate" className="space-y-6 animate-fade-in">
          <GenerateExamTab 
            onSaveExam={handleSaveExam} 
            generatedExam={generatedExam} 
            setGeneratedExam={setGeneratedExam} 
          />
        </TabsContent>
        
        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6 animate-fade-in">
          <PerformanceTab 
            examsWithResults={prepareExamsWithResults()} 
            onDeleteExam={handleDeleteExamResult} 
          />
        </TabsContent>
        
        {/* Previous Exams Tab */}
        <TabsContent value="previous" className="space-y-6 animate-fade-in">
          <PreviousExamsTab 
            exams={previousExams} 
            onDeleteExam={handleDeletePreviousExam} 
          />
        </TabsContent>
        
        {/* Upcoming Exams Tab */}
        <TabsContent value="upcoming" className="space-y-6 animate-fade-in">
          <UpcomingExamsTab 
            exams={upcomingExams}
            onSendReminder={openNotificationDialog}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            isWhatsAppSetup={isWhatsAppSetup}
            onDeleteExam={handleDeleteExam}
          />
        </TabsContent>
      </Tabs>
      
      {/* Notification Dialog */}
      <Dialog open={notificationDialogOpen} onOpenChange={setNotificationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send WhatsApp Reminder</DialogTitle>
            <DialogDescription>
              Send a WhatsApp notification to remind about the upcoming exam.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="phone-number">WhatsApp Number</Label>
              <Input
                id="phone-number"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Include the country code (e.g., +1 for US). For WhatsApp to work, you may need to send a message to the Twilio number first.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={handleSendReminder}
              disabled={isNotifying}
            >
              {isNotifying ? "Sending..." : "Send Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExamTabs;
