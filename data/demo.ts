export type ProvinceStatus = "visited" | "planned" | "unplanned";

export const provinceStatus: Record<string, ProvinceStatus> = {
  四川省: "visited",
  云南省: "visited",
  上海市: "visited",
  浙江省: "visited",
  新疆维吾尔自治区: "planned",
  西藏自治区: "planned",
  青海省: "planned",
};

export const demoStories = [
  {
    id: "western-sichuan",
    province: "四川省",
    city: "甘孜 · 康定 · 新都桥",
    title: "风从折多山吹来",
    date: "示例内容 · 2026.05",
    excerpt: "清晨六点，山口的雾还没有散。我们沿着光线往更高处走，直到雪线从云后出现。",
    rating: 5,
    verdict: "值得专程去",
    pros: ["自然风景", "自驾体验", "光影"],
    cons: ["高反", "路程较长"],
    tone: "blue",
  },
  {
    id: "dali-wind",
    province: "云南省",
    city: "大理 · 洱海",
    title: "在洱海边慢下来",
    date: "示例内容 · 2025.10",
    excerpt: "不是每一段旅行都需要目的。沿着湖岸骑行，风把时间拉得很长。",
    rating: 4,
    verdict: "值得慢慢住几天",
    pros: ["松弛", "骑行", "日落"],
    cons: ["旺季拥挤"],
    tone: "amber",
  },
];

export const plannedTrips = {
  新疆维吾尔自治区: ["独库公路", "喀纳斯", "赛里木湖"],
  西藏自治区: ["拉萨", "林芝", "纳木错"],
  青海省: ["青海湖", "祁连", "大柴旦"],
};
