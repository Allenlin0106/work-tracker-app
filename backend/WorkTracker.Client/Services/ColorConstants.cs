using WorkTracker.Client.Models;

namespace WorkTracker.Client.Services;

public static class ColorConstants
{
    public static readonly List<ColorOption> GroupColors =
    [
        new() { Label="靛藍", Bg="bg-indigo-100",  Text="text-indigo-700",  Border="border-indigo-200",  Active="bg-indigo-600"  },
        new() { Label="琥珀", Bg="bg-amber-100",   Text="text-amber-700",   Border="border-amber-200",   Active="bg-amber-600"   },
        new() { Label="翡翠", Bg="bg-emerald-100", Text="text-emerald-700", Border="border-emerald-200", Active="bg-emerald-600" },
        new() { Label="玫瑰", Bg="bg-rose-100",    Text="text-rose-700",    Border="border-rose-200",    Active="bg-rose-600"    },
        new() { Label="紫色", Bg="bg-purple-100",  Text="text-purple-700",  Border="border-purple-200",  Active="bg-purple-600"  },
        new() { Label="天藍", Bg="bg-sky-100",     Text="text-sky-700",     Border="border-sky-200",     Active="bg-sky-600"     },
        new() { Label="石板", Bg="bg-slate-200",   Text="text-slate-700",   Border="border-slate-300",   Active="bg-slate-600"   },
    ];

    public static readonly List<ColorOption> TagColors =
    [
        new() { Label="紅色",  Bg="bg-red-100",     Text="text-red-700",     Border="border-red-200",     Active="bg-red-600"     },
        new() { Label="橘色",  Bg="bg-orange-100",  Text="text-orange-700",  Border="border-orange-200",  Active="bg-orange-600"  },
        new() { Label="琥珀",  Bg="bg-amber-100",   Text="text-amber-700",   Border="border-amber-200",   Active="bg-amber-600"   },
        new() { Label="黃色",  Bg="bg-yellow-100",  Text="text-yellow-700",  Border="border-yellow-200",  Active="bg-yellow-600"  },
        new() { Label="萊姆",  Bg="bg-lime-100",    Text="text-lime-700",    Border="border-lime-200",    Active="bg-lime-600"    },
        new() { Label="綠色",  Bg="bg-green-100",   Text="text-green-700",   Border="border-green-200",   Active="bg-green-600"   },
        new() { Label="翡翠",  Bg="bg-emerald-100", Text="text-emerald-700", Border="border-emerald-200", Active="bg-emerald-600" },
        new() { Label="青色",  Bg="bg-teal-100",    Text="text-teal-700",    Border="border-teal-200",    Active="bg-teal-600"    },
        new() { Label="青藍",  Bg="bg-cyan-100",    Text="text-cyan-700",    Border="border-cyan-200",    Active="bg-cyan-600"    },
        new() { Label="天藍",  Bg="bg-sky-100",     Text="text-sky-700",     Border="border-sky-200",     Active="bg-sky-600"     },
        new() { Label="藍色",  Bg="bg-blue-100",    Text="text-blue-700",    Border="border-blue-200",    Active="bg-blue-600"    },
        new() { Label="靛藍",  Bg="bg-indigo-100",  Text="text-indigo-700",  Border="border-indigo-200",  Active="bg-indigo-600"  },
        new() { Label="紫羅蘭",Bg="bg-violet-100",  Text="text-violet-700",  Border="border-violet-200",  Active="bg-violet-600"  },
        new() { Label="紫色",  Bg="bg-purple-100",  Text="text-purple-700",  Border="border-purple-200",  Active="bg-purple-600"  },
        new() { Label="紫紅",  Bg="bg-fuchsia-100", Text="text-fuchsia-700", Border="border-fuchsia-200", Active="bg-fuchsia-600" },
        new() { Label="粉紅",  Bg="bg-pink-100",    Text="text-pink-700",    Border="border-pink-200",    Active="bg-pink-600"    },
        new() { Label="玫瑰",  Bg="bg-rose-100",    Text="text-rose-700",    Border="border-rose-200",    Active="bg-rose-600"    },
        new() { Label="灰白",  Bg="bg-gray-100",    Text="text-gray-700",    Border="border-gray-200",    Active="bg-gray-600"    },
    ];
}
