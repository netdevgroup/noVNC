
var XT = {

		0xff1b : 1, // XK_Escape
		0x0031 : 2, // XK_1
		0x0032 : 3, // XK_2
		0x0033 : 4, // XK_3
		0x0034 : 5, // XK_4
		0x0035 : 6, // XK_5
		0x0036 : 7, // XK_6
		0x0037 : 8, // XK_7
		0x0038 : 9, // XK_8
		0x0039 : 10, // XK_9
		0x0030 : 11, // XK_0
		0x002d : 12, // XK_minus
		0x003d : 13, // XK_equal
		0xff08 : 14, // XK_BackSpace
		0xff09 : 15, // XK_Tab
		0x0051 : 16, // XK_Q
		0x0057 : 17, // XK_W
		0x0045 : 18, // XK_E
		0x0052 : 19, // XK_R
		0x0054 : 20, // XK_T
		0x0059 : 21, // XK_Y
		0x0055 : 22, // XK_U
		0x0049 : 23, // XK_I
		0x004f : 24, // XK_O
		0x0050 : 25, // XK_P
		0x005b : 26, // XK_bracketleft
		0x005d : 27, // XK_bracketright
		0xff0d : 28, // XK_Return
		0xffe3 : 29, // XK_Control_L
		0x0041 : 30, // XK_A
		0x0053 : 31, // XK_S
		0x0044 : 32, // XK_D
		0x0046 : 33, // XK_F
		0x0047 : 34, // XK_G
		0x0048 : 35, // XK_H
		0x004a : 36, // XK_J
		0x004b : 37, // XK_K
		0x004c : 38, // XK_L
		0x003b : 39, // XK_semicolon
		0x0027 : 40, // XK_apostrophe
		0x0060 : 41, // XK_grave
		0xffe1 : 42, // XK_Shift_L
		0x005c : 43, // XK_backslash
		0x005a : 44, // XK_Z
		0x0058 : 45, // XK_X
		0x0043 : 46, // XK_C
		0x0056 : 47, // XK_V
		0x0042 : 48, // XK_B
		0x004e : 49, // XK_N
		0x004d : 50, // XK_M
		0x002c : 51, // XK_comma
		0x002e : 52, // XK_period
		0x002f : 53, // XK_slash
		0xffe2 : 54, // XK_Shift_R
		0xffaa : 55, // XK_KP_Multiply
		0xffe9 : 56, // XK_Alt_L
		0x0020 : 57, // XK_space
		0xffe5 : 58, // XK_Caps_Lock
		0xffbe : 59, // XK_F1
		0xffbf : 60, // XK_F2
		0xffc0 : 61, // XK_F3
		0xffc1 : 62, // XK_F4
		0xffc2 : 63, // XK_F5
		0xffc3 : 64, // XK_F6
		0xffc4 : 65, // XK_F7
		0xffc5 : 66, // XK_F8
		0xffc6 : 67, // XK_F9
		0xffc7 : 68, // XK_F10
		0xff7f : 69, // XK_Num_Lock
		0xff14 : 70, // XK_Scroll_Lock
		0xffb7 : 71, // XK_KP_7
		0xffb8 : 72, // XK_KP_8
		0xffb9 : 73, // XK_KP_9
		0xffad : 74, // XK_KP_Subtract
		0xffb4 : 75, // XK_KP_4
		0xffb5 : 76, // XK_KP_5
		0xffb6 : 77, // XK_KP_6
		0xffab : 78, // XK_KP_Add
		0xffb1 : 79, // XK_KP_1
		0xffb2 : 80, // XK_KP_2
		0xffb3 : 81, // XK_KP_3
		0xffb0 : 82, // XK_KP_0
		0xffae : 83, // XK_KP_Decimal
		0x003c : 86, // XK_less (Foriegn Only)
		0xffc8 : 87, // XK_F11
		0xffc9 : 88, // XK_F12
		0xffae : 92, // XK_KP_Decimal (??? - Foriegn Only)
		0xff8d : 156, // XK_KP_Enter
		0xffe4 : 157, // XK_Control_R
		0xffaf : 181, // XK_KP_Divide
		0xffea : 184, // XK_Alt_R (AltGr)
		0xff50 : 199, // XK_Home
		0xff52 : 200, // XK_Up
		0xff55 : 201, // XK_Page_Up
		0xff51 : 203, // XK_Left
		0xff53 : 205, // XK_Right
		0xff57 : 207, // XK_End
		0xff54 : 208, // XK_Down
		0xff56 : 209, // XK_Page_Down
		0xff63 : 210, // XK_Insert
		0xffff : 211, // XK_Delete
		0xff13 : 198, // XK_Pause
		0xffe7 : 219, // XK_Meta_L (Windows Left)
		0xffe8 : 220, // XK_Meta_R (Windows Right)
		0x0028 : 246, // XK_parenleft (??? - Foriegn Only)
		0x0029 : 251, // XK_parenright (??? - Foriegn Only)
		0xffca : 93, // XK_F13
		0xffcb : 94, // XK_F14
		0xffcc : 95, // XK_F15
		0xffcd : 85, // XK_F16
		0xffce : 131, // XK_F17
		0xffcf : 247, // XK_F18
		0xffd0 : 132, // XK_F19
		0xffd1 : 90, // XK_F20
		0xffd2 : 116, // XK_F21
		0xffd3 : 249, // XK_F22
		0xffd4 : 109, // XK_F23
		0xffd5 : 111, // XK_F24
		0xff61 : 185 // XK_Print

};
