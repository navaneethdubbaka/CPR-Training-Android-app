import tkinter as tk
from pathlib import Path
from frame1 import Frame1
from frame2 import Frame2
from frame3 import Frame3
from frame4 import Frame4
from frame5 import Frame5
from frame6 import Frame6
from frame7 import Frame7
from frame8 import Frame8
from frame9 import Frame9
from frame10 import Frame10
from frame11 import Frame11
from frame12 import Frame12
from frame13 import Frame13
from frame14 import Frame14
from frame15 import Frame15
from frame16 import Frame16
from frame17 import Frame17
from frame18 import Frame18
from frame19 import Frame19
from frame20 import Frame20
from frame21 import Frame21
from frame22 import Frame22
from frame23 import Frame23
from frame24 import Frame24
from frame25 import Frame25
from frame26 import Frame26
from frame27 import Frame27
from frame28 import Frame28
from frame29 import Frame29
from frame2_5 import Frame2_5
from frame30 import Frame30

class CPRTrainingApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("CPR Training App")
        self.geometry("1440x1024")
        self.configure(bg="#26B3EF")

        self.assets_path = Path(__file__).parent / "assets"

        container = tk.Frame(self)
        container.pack(side="top", fill="both", expand=True)
        container.grid_rowconfigure(0, weight=1)
        container.grid_columnconfigure(0, weight=1)

        self.frames = {}
        for F in (Frame1, Frame2, Frame3, Frame4, Frame5, Frame6, Frame7, Frame8, Frame9, Frame10, Frame11, Frame12, Frame13, Frame14, Frame15, Frame16, Frame17, Frame18, Frame19, Frame20, Frame21, Frame22, Frame23, Frame24, Frame25, Frame26, Frame27, Frame28, Frame29, Frame2_5, Frame30):
            page_name = F.__name__
            frame = F(parent=container, controller=self)
            self.frames[page_name] = frame
            frame.grid(row=0, column=0, sticky="nsew")

        self.cycle_count = 0  # Initialize the cycle counter
        self.show_frame("Frame1")

    def show_frame(self, page_name):
        print(f"Showing frame: {page_name}")  # Logging
        # Stop serial communication if switching away from a monitoring frame
        current_frame = self.get_current_frame()
        if current_frame and hasattr(current_frame, "on_hide"):
            current_frame.on_hide()

        frame = self.frames[page_name]
        frame.tkraise()

        if hasattr(frame, "on_show"):
            frame.on_show()

        # Start the timer if showing specific frames
        if page_name in ["Frame3", "Frame20", "Frame21", "Frame24", "Frame26", "Frame28"]:
            frame.start_timer()

        # Handle CPR cycle logic
        if page_name == "Frame20":
            self.cycle_count += 1
            if self.cycle_count == 1:
                self.after(2000, lambda: self.show_frame("Frame21"))
            elif self.cycle_count < 5 :
                self.after(2000, lambda: self.show_frame("Frame22"))
            else:
                self.after(2000, lambda: self.show_frame("Frame24"))  # Switch to AED frame

        if page_name == "Frame23":
            if self.cycle_count < 5:
                self.after(2000, lambda: self.show_frame("Frame19"))
            else:
                self.show_frame("Frame24")

    def terminate_cycle(self):
        print("Cycle terminated. Ending process.")  # Add any cleanup or finalization logic here

    def get_current_frame(self):
        for frame in self.frames.values():
            if frame.winfo_ismapped():
                return frame
        return None

if __name__ == "__main__":
    app = CPRTrainingApp()
    app.mainloop()
