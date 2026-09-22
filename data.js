(function () {
  "use strict";

  const places = {
    airport: { name: "济州国际机场", korean: "제주국제공항", address: "제주특별자치도 제주시 공항로 2", lat: 33.5070711, lng: 126.4916441 },
    newStar: { name: "New Star Hotel", korean: "뉴 스타 호텔", address: "제주특별자치도 제주시 서사로 102", lat: 33.5032906, lng: 126.5196238 },
    jejuTerminal: { name: "济州客运站", korean: "제주버스터미널", address: "제주특별자치도 제주시 서광로 174", lat: 33.49919, lng: 126.516324 },
    siheung: { name: "始兴里 · 1号线起点", korean: "시흥리 제주올레 1코스 시작점", address: "제주특별자치도 서귀포시 성산읍 시흥리", lat: 33.47098, lng: 126.88892 },
    gwangchigi: { name: "广峙其海边", korean: "광치기해변", address: "제주특별자치도 서귀포시 성산읍 고성리", lat: 33.4537662, lng: 126.9255233 },
    seongsanPort: { name: "城山港客运码头", korean: "성산포항 종합여객터미널", address: "제주특별자치도 서귀포시 성산읍 성산등용로 112-7", lat: 33.4719127, lng: 126.9331048 },
    udo: { name: "牛岛天津港", korean: "우도 천진항", address: "제주특별자치도 제주시 우도면 연평리", lat: 33.492818, lng: 126.9516017 },
    playce: { name: "Playce Camp Jeju", korean: "플레이스캠프 제주", address: "제주특별자치도 서귀포시 성산읍 동류암로 20", lat: 33.4498936, lng: 126.9187505 },
    namwon: { name: "南元浦口", korean: "남원포구", address: "제주특별자치도 서귀포시 남원읍 남태해안로", lat: 33.2778081, lng: 126.7195669 },
    soesokkak: { name: "牛沼河口", korean: "쇠소깍", address: "제주특별자치도 서귀포시 쇠소깍로 104", lat: 33.2525937, lng: 126.6234661 },
    traveler: { name: "济州偶来旅行者中心", korean: "제주올레 여행자센터", address: "제주특별자치도 서귀포시 중정로 22", lat: 33.2473863, lng: 126.5586387 },
    kenny: { name: "Kenny Stay Jeju Seogwipo", korean: "케니 스테이 제주 서귀포", address: "제주특별자치도 서귀포시 동문로 42", lat: 33.2500953, lng: 126.5649706 },
    seogwipoTerminal: { name: "西归浦客运站", korean: "서귀포버스터미널", address: "제주특별자치도 서귀포시 일주동로 9217", lat: 33.248726, lng: 126.508138 },
    wolpyeong: { name: "月坪偶来起点", korean: "월평아왜낭목 쉼터", address: "제주특별자치도 서귀포시 월평동", lat: 33.2463149, lng: 126.4607759 },
    daepyeong: { name: "大坪浦口", korean: "대평포구", address: "제주특별자치도 서귀포시 안덕면 창천리", lat: 33.2371271, lng: 126.3617071 },
    amantov: { name: "Amantov Pension", korean: "아만토브 펜션", address: "제주특별자치도 서귀포시 예래로 446", lat: 33.2357195, lng: 126.3703987 },
    hwasun: { name: "和顺金沙滩", korean: "화순금모래해수욕장", address: "제주특별자치도 서귀포시 안덕면 화순해안로 69", lat: 33.2403903, lng: 126.3331684 },
    seotal: { name: "Seotal Oreum停车场亭子", korean: "섯알오름 주차장 정자", address: "제주특별자치도 서귀포시 대정읍 상모리 1590-3", lat: 33.2055144, lng: 126.27982 },
    hamo: { name: "11号线官方服务点 · 摹瑟浦", korean: "제주올레 11코스 공식 안내소", address: "제주특별자치도 서귀포시 대정읍 최남단해안로29번길 14", lat: 33.218616, lng: 126.2524507 },
    unjin: { name: "云津港", korean: "운진항", address: "제주특별자치도 서귀포시 대정읍 최남단해안로 120", lat: 33.2096928, lng: 126.2591594 },
    gapado: { name: "加波岛上洞浦口", korean: "가파도 상동포구", address: "제주특별자치도 서귀포시 대정읍 가파리", lat: 33.16974, lng: 126.27136 },
    manjo: { name: "Manjo Icheon 米饭 · 济州城山店", korean: "만조이천쌀밥 제주성산점", address: "제주 서귀포시 성산읍 성산중앙로 5", lat: 33.460901, lng: 126.9311815 },
    seomSonai: { name: "Seom Sonai 牛岛本店", korean: "섬소나이 우도본점", address: "제주 제주시 우도면 우도해안길 814", lat: 33.513337, lng: 126.9575652 },
    cafeSalle: { name: "Cafe Salle", korean: "카페살레", address: "제주 제주시 우도면 우도해안길 816 1,2층", lat: 33.5131314, lng: 126.9577602 },
    cafeTheLight: { name: "Cafe The Light", korean: "카페더라이트", address: "제주 서귀포시 성산읍 한도로 269", lat: 33.465664, lng: 126.9359915 },
    ojeong: { name: "Ojeong紫菜包饭", korean: "오는정김밥", address: "제주 서귀포시 동문동로 2 1층", lat: 33.2496637, lng: 126.5675976 },
    halmeoniTteok: { name: "奶奶年糕店", korean: "할머니떡집", address: "제주 서귀포시 중앙로42번길 24", lat: 33.2485738, lng: 126.5641503 },
    angeori: { name: "Angeori Bangeori", korean: "안거리밖거리", address: "제주 서귀포시 솔동산로 6-1", lat: 33.2442633, lng: 126.5641048 },
    chunsim: { name: "Chunsim's 总店", korean: "춘심이네 본점", address: "제주 서귀포시 안덕면 창천중앙로24번길 16", lat: 33.2645164, lng: 126.370493 },
    hodoBakery: { name: "Hodo Bakery", korean: "호도제과", address: "제주 서귀포시 안덕면 화순로 132", lat: 33.2465429, lng: 126.3322486 },
    miyeong: { name: "Miyeongine 生鱼片餐厅", korean: "미영이네", address: "제주 서귀포시 대정읍 하모항구로 42", lat: 33.217709, lng: 126.2497839 },
    boryong: { name: "宝龙制果 · 城山面包店", korean: "보룡제과", address: "제주특별자치도 서귀포시 성산읍 고성오조로 48-1 1층", kakaoPlaceId: "10375136" },
    seongsanPork: { name: "海景黑猪肉 · 城山本店", korean: "전망좋은집흑돼지 성산본점", address: "제주특별자치도 서귀포시 성산읍 일출로 248 1층", kakaoPlaceId: "1538639318" },
    peanutCaramel: { name: "花生焦糖屋 · 牛岛", korean: "피넛캬라멜하우스", address: "제주특별자치도 제주시 우도면 삼양고수물길 11 1층 2호", kakaoPlaceId: "163272488" },
    wimiMeal: { name: "为美定食", korean: "위미정식", address: "제주특별자치도 서귀포시 남원읍 위미중앙로196번길 15 1층", kakaoPlaceId: "452183254" },
    gongcheon: { name: "公泉浦食堂", korean: "공천포식당", address: "제주특별자치도 서귀포시 남원읍 공천포로 89", kakaoPlaceId: "8204729" },
    odonga: { name: "Odon-ga 黑猪肉", korean: "오돈가", address: "제주특별자치도 서귀포시 태평로 444 1층", kakaoPlaceId: "2046167040" },
    yeongeun: { name: "Yeongeun 面馆 · 法还", korean: "영은맛집", address: "제주특별자치도 서귀포시 막숙포로 66-18", kakaoPlaceId: "490279102" },
    nammaeNewtown: { name: "兄妹家黑猪肉 · 新市区店", korean: "남매네흑돼지 신시가지점", address: "제주특별자치도 서귀포시 신서로32번길 18 1층", kakaoPlaceId: "713217222" },
    suduri: { name: "中门 Suduri 海螺刀切面", korean: "중문수두리보말칼국수", address: "제주특별자치도 서귀포시 천제연로 192 1층", kakaoPlaceId: "1148098112" },
    seonchaehyang: { name: "Seonchaehyang 鲍鱼料理", korean: "제주선채향", address: "제주특별자치도 서귀포시 안덕면 사계남로84번길 6 1층", kakaoPlaceId: "1612962916" },
    hwasunMeal: { name: "和顺韩家食堂", korean: "화순한가네식당", address: "제주특별자치도 서귀포시 안덕면 화순해안로 109", kakaoPlaceId: "623072470" },
    gapadoHotdog: { name: "金镇贤热狗 · 加波岛", korean: "가파도 김진현 핫도그", address: "제주특별자치도 서귀포시 대정읍 가파로67번길 95-7", kakaoPlaceId: "447177026" },
    malmiOreum: { name: "马头岳观景", korean: "말미오름", address: "" },
    jongdalSalt: { name: "终达里旧盐田", korean: "종달리 옛 소금밭", address: "" },
    udoCoral: { name: "牛岛红藻团块海滨", korean: "홍조단괴해변", address: "" },
    hagosudong: { name: "牛岛下古水洞海滩", korean: "하고수동해수욕장", address: "" },
    keunEong: { name: "大崖海岸入口", korean: "큰엉 입구", address: "" },
    neopBille: { name: "宽阔熔岩海岸", korean: "넙빌레", address: "" },
    soraCastle: { name: "螺之城", korean: "소라의 성", address: "" },
    olleMarketEntrance: { name: "西归浦每日偶来市场入口", korean: "서귀포 매일올레시장 입구", address: "" },
    solbitBada: { name: "Solbit Bada 海岸", korean: "솔빛바다", address: "" },
    beophwanPort: { name: "法还浦口", korean: "법환포구", address: "" },
    eongttoFalls: { name: "Eongtto 瀑布", korean: "엉또폭포", address: "" },
    hannonCrater: { name: "Hannon 火山口", korean: "하논분화구", address: "" },
    daepoColumns: { name: "大浦柱状节理", korean: "대포주상절리", address: "" },
    nonjitmul: { name: "Nonjitmul 海岸水池", korean: "논짓물", address: "" },
    sagyeVillage: { name: "四季渔村海岸", korean: "사계어촌체험마을", address: "" },
    songaksanView: { name: "松岳山观景台", korean: "송악산 전망대", address: "" },
    hamoBeach: { name: "下摹海滩", korean: "하모해수욕장", address: "" },
    natGol: { name: "加波岛海岸 · Natgolchaengi", korean: "낫골챙이", address: "" },
    keunWangjin: { name: "加波岛海岸 · Keunwangjinmul", korean: "큰왕진물", address: "" }
  };

  const defaultCheckins = [
    { id: "cafe-the-light", dayId: "0924", place: "cafeTheLight", category: "cafe", priority: "有余量再去", slot: "1号线结束后 · 最迟12:40离店", dish: "精品咖啡", note: "约十年历史、韩国拉花冠军线索对应的咖啡店。只适合外带，线路延误就跳过。", mode: "步行" },
    { id: "cafe-salle", dayId: "0924", place: "cafeSalle", category: "cafe", priority: "必打卡", slot: "牛岛骑行途中 · 15–20分钟", dish: "牛岛花生曲奇", note: "经过时顺路购买，最迟16:10离店，营业状态当天确认。", mode: "骑行" },
    { id: "seom-sonai", dayId: "0924", place: "seomSonai", category: "food", priority: "备选", slot: "与Cafe Salle二选一", dish: "海鲜辣汤面", note: "只有骑行进度领先时安排；不要与甜品店都久坐。", mode: "骑行" },
    { id: "manjo", dayId: "0924", place: "manjo", category: "food", priority: "首选晚餐", slot: "牛岛返航后 · 18:00–19:00", dish: "石锅米饭定食", note: "位于城山，不在牛岛。中秋营业务必前一晚复核。", mode: "公交" },
    { id: "halmeoni-tteok", dayId: "0925", place: "halmeoniTteok", category: "food", priority: "顺路", slot: "入住后 · 每日偶来市场", dish: "水果糯米年糕", note: "适合买后尽快吃；排队超过15分钟就先回酒店休息。", mode: "步行" },
    { id: "ojeong", dayId: "0925", place: "ojeong", category: "food", priority: "备选", slot: "15:15后 · Kenny附近", dish: "招牌紫菜包饭", note: "建议到西归浦前先电话确认营业与取餐时间。", mode: "步行" },
    { id: "angeori", dayId: "0926", place: "angeori", category: "food", priority: "恢复晚餐", slot: "完成7-1后", dish: "玉鲷家常定食", note: "长距离徒步后的正餐，按体力和营业状态决定。", mode: "步行" },
    { id: "hodo-bakery", dayId: "0927", place: "hodoBakery", category: "cafe", priority: "外带补给", slot: "前往和顺起点途中", dish: "济州艾草板栗红豆面包", note: "最多停留10分钟，排队或售罄就直接跳过。", mode: "打车" },
    { id: "chunsim", dayId: "0927", place: "chunsim", category: "food", priority: "可选晚餐", slot: "返回民宿后", dish: "整条烤带鱼", note: "偏多人分享菜，独自用餐先确认合适份量。", mode: "打车" },
    { id: "miyeong", dayId: "0928", place: "miyeong", category: "food", priority: "可选午餐", slot: "领证后 · 约13:35–14:30", dish: "青花鱼刺身", note: "与提前去机场二选一；排队超过20分钟就放弃，14:30后出发去机场。", mode: "打车" }
  ];

  // Snapshot read on 2026-09-22 from Daum's public Kakao place cards.
  // Counts are star-rating participants, not the separate blog-review count.
  // Keep existing IDs: users' completed visits must survive content updates.
  const foodSnapshots = {
    "cafe-salle": { routeIds: ["1-1"], score: 4.6, count: 135, placeId: "811454849", query: "제주 우도 맛집", hours: "通常09:30–18:00；中秋营业待确认。", note: "保留花生曲奇愿望清单，库存现场确认；公开菜单另有花生冰淇淋₩6,000、花生拿铁₩7,000。最迟16:10离店。" },
    "seom-sonai": { routeIds: ["1-1"], score: 4.3, count: 209, placeId: "24213584", query: "제주 우도 맛집", hours: "营业时间与中秋安排待确认。" },
    "angeori": { routeIds: ["7-1"], score: 3.0, count: 122, placeId: "7999360", query: "제주 안거리밖거리", priority: "普通备选", hours: "营业时间与中秋安排待确认。", note: "保留原收藏和已到访记录；本次查询评分较低，降低优先级，先看其他晚餐候选。" },
    "miyeong": { routeIds: ["10"], score: 4.3, count: 567, placeId: "9006988", query: "제주 미영이네 식당", hours: "通常11:30–22:00，20:30最后点单；周三休。", note: "刺身配汤小份约₩70,000，单人先确认份量；与提前去机场二选一，排队超过20分钟就跳过，14:30后出发去机场。" }
  };
  const foodRecommendations = [
    { id: "boryong", dayId: "0924", routeIds: ["1"], place: "boryong", category: "cafe", priority: "顺路补给", slot: "牛岛返航后 · 回酒店前", dish: "面包、栗子吐司", note: "位于古城里，不是清晨采购点；晚上售罄就跳过，不为买面包影响14:00船班。", mode: "步行", score: 4.8, count: 743, query: "제주 성산 맛집", hours: "通常10:00–22:00，售罄早收；周二休，9/28另标休息。9/24中秋安排待确认。" },
    { id: "seongsan-pork", dayId: "0924", routeIds: ["1"], place: "seongsanPork", category: "food", priority: "晚餐备选", slot: "牛岛返航后 · 与Manjo二选一", dish: "黑猪肉、鲍鱼海鲜砂锅", note: "烤肉先确认单人最低点单量；公开菜单另有约₩15,000的鲍鱼海鲜砂锅等单份菜。", mode: "步行", score: 4.8, count: 462, query: "제주 전망좋은집흑돼지 성산본점", hours: "通常12:00–22:00；中秋营业与最后点单时间待确认。" },
    { id: "peanut-caramel", dayId: "0924", routeIds: ["1-1"], place: "peanutCaramel", category: "cafe", priority: "甜品备选", slot: "牛岛骑行途中 · 与Cafe Salle二选一", dish: "花生冰淇淋约₩6,000、手工焦糖约₩1,400", note: "53人评分的满分候选，不代表全岛第一；只选一家久坐，另一家有余量再外带，留足还车与回港时间。", mode: "骑行", score: 5.0, count: 53, query: "제주 피넛캬라멜하우스", hours: "通常10:00–18:00；中秋营业待确认。" },
    { id: "wimi-meal", dayId: "0925", routeIds: ["5"], place: "wimiMeal", category: "food", priority: "时间冲突 · 备选", slot: "为美村 · 仅晚经过时考虑", dish: "白切猪肉／炒猪肉定食约₩10,000", note: "仅15人评分，样本较少。10:30才开门，按原徒步计划经过时可能尚未营业，不专门等开门。", mode: "步行", score: 5.0, count: 15, query: "제주 남원 위미 맛집", hours: "通常10:30–15:00；周日休。9/25中秋当天是否营业待确认。" },
    { id: "gongcheon", dayId: "0925", routeIds: ["5"], place: "gongcheon", category: "food", priority: "补餐备选", slot: "5号线后段 · 公泉浦", dish: "鲍鱼冷汤／鲍鱼盖饭约₩16,000", note: "比为美村更靠近路线后段；仍须确认到达时已营业，中秋当天带好备用补给。", mode: "步行", score: 4.1, count: 270, query: "제주 공천포식당", hours: "通常10:00–15:30，15:00最后点单；周四休。9/25中秋营业待确认。" },
    { id: "odonga", dayId: "0925", routeIds: ["6"], place: "odonga", category: "food", priority: "晚餐备选", slot: "走完6号线 · 入住后", dish: "黑猪肉", note: "城区晚餐候选；单人能否只点一份需提前确认，不影响白天的徒步进度。", mode: "步行", score: 4.6, count: 146, query: "제주 서귀동 맛집", hours: "通常12:00–24:00；9/25中秋营业待确认。" },
    { id: "yeongeun", dayId: "0926", routeIds: ["7"], place: "yeongeun", category: "food", priority: "时间冲突 · 备选", slot: "法还浦口附近 · 10:00后", dish: "猪肉汤面约₩8,000、海螺刀切面约₩9,000", note: "10:00才开门，按原计划可能提前经过；不要为了等面馆推迟7-1出发。", mode: "步行", score: 4.5, count: 113, query: "제주 서귀포시 법환동 식당", hours: "通常10:00–16:00；周二休，中秋营业待确认。" },
    { id: "nammae-newtown", dayId: "0926", routeIds: ["7-1"], place: "nammaeNewtown", category: "food", priority: "时间冲突 · 备选", slot: "客运站周边 · 11:00后", dish: "午间猪肉包饭定食约₩10,000", note: "11:00才开门，与10:15开始7-1冲突，仅延迟出发时考虑；先问单人午间定食是否供应。", mode: "步行", score: 4.8, count: 106, query: "제주 서귀포 신시가지 맛집", hours: "通常11:00–23:00，22:15最后点单；午间菜单时段和中秋安排待确认。" },
    { id: "suduri", dayId: "0927", routeIds: ["8"], place: "suduri", category: "food", priority: "绕路备选", slot: "中门段 · 仅进度领先时", dish: "海螺刀切面约₩12,000、海螺粥约₩14,000", note: "需从海岸线绕入中门城区；当天还要走10号线，排队或绕路耗时较长就跳过。", mode: "步行", score: 4.5, count: 800, query: "제주 중문 맛집", hours: "通常08:00–16:00；周二休，不提供外带。中秋安排待确认。" },
    { id: "seonchaehyang", dayId: "0927", routeIds: ["10"], place: "seonchaehyang", category: "food", priority: "午餐备选", slot: "10号线 · 四季海岸一带", dish: "鲍鱼刀切面、鲍鱼粥", note: "现地址在四季海岸一带，不在大坪。与和顺韩家午餐二选一；先查排队和当日营业，不为美食耽误中间章。", mode: "步行", score: 4.8, count: 474, query: "제주선채향", hours: "本次未核实完整营业时段；出发前查看Kakao门店并确认是否仍可取号。" },
    { id: "hwasun-meal", dayId: "0927", routeIds: ["10"], place: "hwasunMeal", category: "food", priority: "午餐备选", slot: "和顺起点前 · 时间充足再坐下吃", dish: "炸猪肉定食约₩13,000、泡菜汤饭约₩10,000", note: "和顺海岸路109号，适合开始10号线前补餐；不能超过12:30出发截止。炒猪肉需点两人份，单人优先选定食。", mode: "步行", score: 4.7, count: 278, query: "제주 화순 맛집", hours: "通常10:00–17:00；周四休，食材售罄提前结束。中秋安排待确认。" },
    { id: "gapado-hotdog", dayId: "0928", routeIds: ["10-1"], place: "gapadoHotdog", category: "food", priority: "顺路外带", slot: "加波岛徒步途中 · 不影响返船", dish: "原味／微辣热狗约₩4,000", note: "适合短暂停留和外带；加波岛取消时一起跳过，不额外安排岛上午餐。", mode: "步行", score: 4.7, count: 59, query: "제주 가파도 맛집", hours: "通常09:00–19:00；仍以返程船班为硬截止。" }
  ];
  function applyFoodSnapshot(item, snapshot) {
    const place = places[item.place];
    if (snapshot.placeId) place.kakaoPlaceId = snapshot.placeId;
    item.routeIds = snapshot.routeIds;
    item.foodRating = { score: snapshot.score, count: snapshot.count, checkedAt: "2026-09-22", sourceUrl: "https://search.daum.net/search?w=tot&q=" + encodeURIComponent(snapshot.query) };
    item.hours = snapshot.hours;
    if (snapshot.priority) item.priority = snapshot.priority;
    if (snapshot.note) item.note = snapshot.note;
  }
  defaultCheckins.forEach(function (item) {
    if (foodSnapshots[item.id]) applyFoodSnapshot(item, foodSnapshots[item.id]);
  });
  foodRecommendations.forEach(function (recommendation) {
    const item = Object.assign({}, recommendation);
    applyFoodSnapshot(item, recommendation);
    delete item.score; delete item.count; delete item.query;
    defaultCheckins.push(item);
  });
  const existingFoodRoutes = { "cafe-the-light": ["1"], manjo: ["1"], "halmeoni-tteok": ["6"], ojeong: ["6"], "hodo-bakery": ["10"], chunsim: ["8"] };
  defaultCheckins.forEach(function (item) {
    if (existingFoodRoutes[item.id]) item.routeIds = existingFoodRoutes[item.id];
  });

  const routes = {
    "1": { id: "1", km: 15.1, mode: "徒步", counts: true },
    "1-1": { id: "1-1", km: 13.2, mode: "骑行", counts: false },
    "5": { id: "5", km: 13.4, mode: "徒步", counts: true },
    "6": { id: "6", km: 10.1, mode: "徒步", counts: true },
    "7": { id: "7", km: 12.9, mode: "徒步", counts: true },
    "7-1": { id: "7-1", km: 15.7, mode: "徒步", counts: true },
    "8": { id: "8", km: 19.3, mode: "徒步", counts: true },
    "10": { id: "10", km: 15.6, mode: "徒步", counts: true },
    "10-1": { id: "10-1", km: 4.2, mode: "徒步", counts: true, optional: true, stamps: ["start", "end"] }
  };

  // Names and route kilometer marks come from Jeju Olle's official course diagrams.
  // No nearby landmark coordinate is presented as an unverified middle stamp box.
  const stampLocations = {
    "1": { map: "road_01_imgmap_mo_202512.jpg", start: { korean: "시흥리 버스정류장", km: 0, place: "siheung" }, middle: { korean: "목화휴게소", km: 8.1 }, end: { korean: "광치기해변", km: 15.1, place: "gwangchigi" } },
    "1-1": { map: "road_01-1_imgmap_mo_2024.jpg", start: { korean: "천진항 A", km: 0, place: "udo" }, middle: { korean: "하고수동해수욕장", km: 6.8 }, end: { korean: "천진항 A", km: 13.2, place: "udo" }, hint: "官方图另标 하우목동항 B（3.5 km / 13.2 km），先确认船实际停靠哪个港口。" },
    "5": { map: "road_05_imgmap_mo_2024.jpg", start: { korean: "남원포구", km: 0, place: "namwon" }, middle: { korean: "위미 동백나무 군락지", km: 4.9 }, end: { korean: "쇠소깍다리", km: 13.4, place: "soesokkak" } },
    "6": { map: "road_06_imgmap_mo_2024.jpg", start: { korean: "쇠소깍다리", km: 0, place: "soesokkak" }, middle: { korean: "소라의 성", km: 7.4 }, end: { korean: "제주올레여행자센터", km: 10.1, place: "traveler" } },
    "7": { map: "road_07_imgmap_mo_2025.jpg", start: { korean: "제주올레여행자센터", km: 0, place: "traveler" }, middle: { korean: "두머니물공원", km: 9.8 }, end: { korean: "서귀포버스터미널 앞", km: 12.9, place: "seogwipoTerminal" } },
    "7-1": { map: "road_07-1_imgmap_mo_2024.jpg", start: { korean: "서귀포버스터미널 앞", km: 0, place: "seogwipoTerminal" }, middle: { korean: "고근산 정상 (산불감시초소)", km: 7.1 }, end: { korean: "제주올레여행자센터", km: 15.7, place: "traveler" } },
    "8": { map: "road_08_imgmap_mo_2026.jpg", start: { korean: "월평아왜낭목 쉼터", km: 0, place: "wolpyeong" }, middle: { korean: "베릿내 공원 정자", km: 8.4 }, end: { korean: "대평포구", km: 19.3, place: "daepyeong" } },
    "10": { map: "road_10_imgmap_mo_2025.jpg", start: { korean: "제주올레공식안내소", km: 0, note: "和顺金沙滩约在起点后 0.1 km；章在官方 안내소。" }, middle: { korean: "섯알오름 주차장 정자", km: 11.4, place: "seotal" }, end: { korean: "하모체육공원", km: 15.6, note: "终点章在运动公园；领证服务点另见下方时间轴。" } },
    "10-1": { map: "road_10-1_imgmap_mo_2024.jpg", start: { korean: "상동포구", km: 0, place: "gapado" }, end: { korean: "가파치안센터", km: 4.2, note: "官方分段图未标中间章；纸质护照以现场为准。终点不在返程码头，另留回港时间。" } }
  };

  const routeGuides = {
    "1": { title: "山丘到海岸", intro: "济州偶来最早开放的路：先登火山丘陵看城山与牛岛，再沿旧盐田和海岸走向广峙其。", highlights: [
      { id: "route-1-malmi", place: "malmiOreum", dayId: "0924", km: 1.8, stop: "5分钟", note: "登高看城山日出峰、牛岛与东部田野；不要久留，以免错过14:00牛岛船。" },
      { id: "route-1-salt", place: "jongdalSalt", dayId: "0924", km: 6.5, stop: "3分钟", note: "终达里旧盐田遗址，留意海岸村落与旧制盐历史。" }
    ] },
    "1-1": { title: "牛岛海滨与石墙", intro: "海岸、草地和石墙交替出现；骑行只作游览，不计100 km徒步认证。", highlights: [
      { id: "route-1-1-coral", place: "udoCoral", dayId: "0924", km: 2.3, stop: "5分钟", note: "看浅色红藻团块海滨；先确认实际登陆港，再对应官方A/B线路。" },
      { id: "route-1-1-hagosu", place: "hagosudong", dayId: "0924", km: 6.8, stop: "盖章＋5分钟", note: "这里也是中间章地点；短暂停留即可，保留回港和还车时间。" }
    ] },
    "5": { title: "大崖与山茶树村落", intro: "从南元浦口沿海岸进入大崖散步道，途中可见石岸、常绿林和山茶树围成的村落。", highlights: [
      { id: "route-5-keun-eong", place: "keunEong", dayId: "0925", km: 1.2, stop: "5分钟", note: "大崖海岸散步道的起点，海崖与林荫景观；中秋当日仍以赶路为先。" },
      { id: "route-5-neop", place: "neopBille", dayId: "0925", km: 9.5, stop: "3分钟", note: "海边熔岩石岸，可顺路看浪与岩面，不为拍照离开官方路标。" }
    ] },
    "6": { title: "海岸走进西归浦", intro: "从牛沼河口沿海岸进入旧城，路过海边观景点、李仲燮街与每日偶来市场。", highlights: [
      { id: "route-6-sora", place: "soraCastle", dayId: "0925", km: 7.4, stop: "盖章＋3分钟", note: "螺之城也是本线中间章；短看海景后继续去旅行者中心。" },
      { id: "route-6-market", place: "olleMarketEntrance", dayId: "0925", km: 9.6, stop: "路过即可", note: "市场入口在终点前，想吃年糕可结束徒步后再回来，不背补给拖慢进度。" }
    ] },
    "7": { title: "水峰路与法还浦口", intro: "沿西归浦南岸走过自然小径与港口；水峰路是由偶来开路人手工修出的海岸路段。", highlights: [
      { id: "route-7-solbit", place: "solbitBada", dayId: "0926", km: 3.0, stop: "3分钟", note: "沿路看海岸与礁石，不下到湿滑岩面。" },
      { id: "route-7-beophwan", place: "beophwanPort", dayId: "0926", km: 8.5, stop: "5分钟", note: "法还浦口小歇补水；到终点后还要走15.7 km的7-1。" }
    ] },
    "7-1": { title: "内陆火山丘陵", intro: "从客运站走入济州中山间，登高可看汉拿山与南岸，再沿火山口和村道回到旧城。", highlights: [
      { id: "route-7-1-eongtto", place: "eongttoFalls", dayId: "0926", km: 4.0, stop: "按天气", note: "Eongtto瀑布通常要强降雨后才有水；无水或需绕行时直接走过。" },
      { id: "route-7-1-hannon", place: "hannonCrater", dayId: "0926", km: 12.5, stop: "3分钟", note: "留意火山口地形与稻田遗迹，靠近终点时不额外爬坡。" }
    ] },
    "8": { title: "柱状节理到大坪", intro: "沿深色海岸和中门区域前进，穿过柱状节理一带，最后抵达更安静的大坪村。", highlights: [
      { id: "route-8-columns", place: "daepoColumns", dayId: "0927", km: 4.9, stop: "5分钟", note: "看熔岩冷却形成的柱状节理；官方路线上顺路观赏，付费观景台另算绕行。" },
      { id: "route-8-nonjitmul", place: "nonjitmul", dayId: "0927", km: 15.9, stop: "3分钟", note: "海岸淡水与海水交汇的水池一带，休息后继续赶往大坪。" }
    ] },
    "10": { title: "山房山与松岳山海岸", intro: "和顺至摹瑟浦一路看山房山、海岸和松岳山；27日先走到中间章，28日接续终点。", highlights: [
      { id: "route-10-sagye", place: "sagyeVillage", dayId: "0927", km: 4.2, stop: "3分钟", note: "山房山下的四季海岸；27日仍须在计划时间前走到11.4 km中间章。" },
      { id: "route-10-songak", place: "songaksanView", dayId: "0927", km: 8.9, stop: "5分钟", note: "回望山房山、向海上看加波岛与马罗岛；按官方路标继续向Seotal。" },
      { id: "route-10-hamo", place: "hamoBeach", dayId: "0928", km: 13.8, stop: "路过即可", note: "续走10号线的最后一段海岸；先盖终点章和确认领证，别为海滩停留误船。" }
    ] },
    "10-1": { title: "低矮海岛慢步", intro: "加波岛地势低平，村落、石墙与海岸交替；秋季不要把春天青麦田当成必见景色。", highlights: [
      { id: "route-10-1-natgol", place: "natGol", dayId: "0928", km: 1.6, stop: "3分钟", note: "沿岛西岸看海与石墙，时间受返船及证书受理截止约束。" },
      { id: "route-10-1-wangjin", place: "keunWangjin", dayId: "0928", km: 3.4, stop: "3分钟", note: "接近南岸终点的海景点；终点仍需安排回上洞浦口的交通。" }
    ] }
  };

  Object.keys(routeGuides).forEach(function (routeId) {
    routeGuides[routeId].highlights.forEach(function (point) {
      defaultCheckins.push({ id: point.id, dayId: point.dayId, routeIds: [routeId], place: point.place, category: "scenic", priority: "顺路", slot: routeId + "号线 " + point.km.toFixed(1) + " km · " + point.stop, note: point.note, mode: routes[routeId].mode, routeHighlight: true });
    });
  });

  const days = [
    {
      id: "0923", date: "9月23日", weekday: "周三", label: "抵达济州", walkKm: 0, routeIds: [],
      lead: "落地后只做一件事：尽快入住并把明早补给准备好。",
      next: { time: "21:35", title: "9C7205抵达济州国际机场", detail: "取行李、入境后直接前往出租车乘车区。", mode: "航班", place: "airport" },
      timeline: [
        { id: "0923-step-01", time: "18:55", timeZone: "Asia/Shanghai", title: "北京大兴机场起飞", detail: "北京时间18:55（济州19:55）。春秋航空9C7205，PKX → CJU；最终时间以机票订单为准。", type: "航班" },
        { id: "0923-step-02", time: "21:35", title: "抵达济州国际机场", detail: "预留45–65分钟取行李和入境。", type: "航班", place: "airport" },
        { id: "0923-step-03", time: "22:20", title: "机场出租车 → New Star Hotel", detail: "车程约10–15分钟，向司机出示韩文酒店名和地址。", type: "打车", place: "newStar" },
        { id: "0923-step-04", time: "22:45", title: "办理入住", detail: "确认次日05:35退房；备好早餐、水、电解质和便携午餐。", type: "住宿", place: "newStar" }
      ],
      hotel: "newStar"
    },
    {
      id: "0924", date: "9月24日", weekday: "周四", label: "1 + 牛岛", walkKm: 15.1, bikeKm: 13.2, routeIds: ["1", "1-1"],
      lead: "先坐201路到Playce Camp寄存行李，再返回古城站换反方向201路去始兴里。",
      next: { time: "05:35", title: "New Star Hotel → Playce寄存行李", detail: "步行到济州客运站，目标搭05:55左右的201路。", mode: "公交", place: "playce" },
      timeline: [
        { id: "0924-step-01", time: "05:35", title: "退房，步行前往济州客运站", detail: "约10–15分钟，携带全部行李。", type: "步行", place: "jejuTerminal" },
        { id: "0924-step-02", time: "05:55", title: "201路 → 古城换乘站", detail: "预计07:20–07:35抵达；前一晚复核中秋班次。", type: "公交", place: "playce" },
        { id: "0924-step-03", time: "07:45", title: "Playce Camp寄存行李", detail: "只做快速寄存，必须提前确认清晨可接收行李。", type: "行李", place: "playce" },
        { id: "0924-step-04", time: "07:55", title: "返回古城站，搭201路去始兴里", detail: "在反方向站台乘车，目标08:15–08:25抵达。", type: "公交", place: "siheung" },
        { id: "0924-step-05", time: "08:25", title: "1号线 · 始兴里 → 广峙其海边", detail: "15.1 km，按约4小时快走，起点、中间、终点章都要盖。", type: "徒步", place: "siheung" },
        { id: "0924-step-06", time: "12:20", title: "抵达广峙其海边", detail: "盖终点章后搭211、212或295路前往城山港。", type: "转场", place: "gwangchigi" },
        { id: "0924-step-07", time: "13:00", title: "城山港购票、候船", detail: "现场确认17:30返程船班并补给。", type: "船班", place: "seongsanPort" },
        { id: "0924-step-08", time: "14:00", title: "乘船前往牛岛", detail: "约15分钟抵达，租车时确认17:10前还车。", type: "船班", place: "udo" },
        { id: "0924-step-09", time: "14:30", title: "牛岛1-1号线骑行", detail: "13.2 km，目标约2.5小时；骑行不计认证步行里程。", type: "骑行", place: "udo" },
        { id: "0924-step-10", time: "17:10", title: "回到牛岛码头", detail: "还车后搭17:30返程船，18:00只作紧急备用。", type: "截止", place: "udo", risk: true },
        { id: "0924-step-11", time: "18:00", title: "城山港 → Playce Camp", detail: "搭211、212或295路返回，取行李并办理入住。", type: "公交", place: "playce" }
      ],
      cutoff: "08:05仍未离开酒店就打车去始兴里；12:35尚未走完1号线则取消牛岛骑行。",
      fallback: "牛岛取消后，从广峙其海边搭201、211、212或295路返回Playce Camp。",
      hotel: "playce"
    },
    {
      id: "0925", date: "9月25日", weekday: "周五 · 中秋", label: "5 + 6", walkKm: 23.5, routeIds: ["5", "6"],
      lead: "大件行李必须提前安排转送或寄存，只背日包完成23.5 km。",
      next: { time: "05:45", title: "Playce Camp → 南元浦口", detail: "确认大件行李去向后打车45–55分钟，201路仅作备选。", mode: "打车", place: "namwon" },
      timeline: [
        { id: "0925-step-01", time: "05:45", title: "退房，确认大件行李已转送", detail: "只携带徒步日包；未确认行李方案时不要直接开走。", type: "行李", place: "playce" },
        { id: "0925-step-02", time: "06:45", title: "5号线 · 南元 → 牛沼河口", detail: "13.4 km，目标3.5–4小时，完成三章。", type: "徒步", place: "namwon" },
        { id: "0925-step-03", time: "10:30", title: "牛沼河口短休整", detail: "补水、进食后接走6号线，不安排正式午餐。", type: "补给", place: "soesokkak" },
        { id: "0925-step-04", time: "10:45", title: "6号线 · 牛沼河口 → 旅行者中心", detail: "10.1 km，目标2.5–3小时，完成三章。", type: "徒步", place: "soesokkak" },
        { id: "0925-step-05", time: "14:30", title: "抵达济州偶来旅行者中心", detail: "最晚目标15:30，步行约10–15分钟去酒店。", type: "到达", place: "traveler" },
        { id: "0925-step-06", time: "15:00", title: "入住Kenny Stay", detail: "取回大件行李，9月25日与26日连住两晚。", type: "住宿", place: "kenny" }
      ],
      cutoff: "中秋当天不要把沿途餐厅、便利店或游客中心正常营业作为前提。",
      fallback: "行李转送未确认时，先联系Kenny或Playce，不背大件行李走完整路线。",
      hotel: "kenny"
    },
    {
      id: "0926", date: "9月26日", weekday: "周六", label: "7 + 7-1", walkKm: 28.6, routeIds: ["7", "7-1"],
      lead: "利用酒店与线路闭环位置，全天轻装完成28.6 km。",
      next: { time: "06:15", title: "Kenny Stay → 旅行者中心", detail: "步行约10–15分钟，06:30准时开走。", mode: "步行", place: "traveler" },
      timeline: [
        { id: "0926-step-01", time: "06:15", title: "从酒店步行出发", detail: "行李留在连住酒店，只带徒步装备，前往旅行者中心。", type: "步行", place: "traveler" },
        { id: "0926-step-02", time: "06:30", title: "7号线 · 旅行者中心 → 西归浦客运站", detail: "12.9 km，目标3–3.5小时，完成三章。", type: "徒步", place: "traveler" },
        { id: "0926-step-03", time: "09:45", title: "客运站补给与盖章", detail: "预留20–30分钟补水进食，确认7-1起点章。", type: "补给", place: "seogwipoTerminal" },
        { id: "0926-step-04", time: "10:15", title: "7-1号线 · 客运站 → 旅行者中心", detail: "15.7 km，目标4–4.5小时，完成三章。", type: "徒步", place: "seogwipoTerminal" },
        { id: "0926-step-05", time: "14:30", title: "回到旅行者中心", detail: "最晚目标15:30，之后步行返回Kenny Stay。", type: "到达", place: "traveler" }
      ],
      cutoff: "下午出现持续膝痛、脚踝痛或水泡恶化时，停止追求计划配速。",
      fallback: "从可安全离开的主路站点返回酒店；证书仍优先于单日完整性。",
      hotel: "kenny"
    },
    {
      id: "0927", date: "9月27日", weekday: "周日", label: "8 + 10前段", walkKm: 30.7, routeIds: ["8", "10"],
      stampPlan: [
        { routeId: "8", stamps: ["start", "middle", "end"], note: "完成三章" },
        { routeId: "10", stamps: ["start", "middle"], note: "本日盖起点、中间章" }
      ],
      lead: "先完成8号线；仅在时间和身体状态都达标时继续10号线前段。",
      next: { time: "05:35", title: "Kenny Stay → 月坪起点", detail: "大件行李提前转送Amantov，轻装打车20–25分钟。", mode: "打车", place: "wolpyeong" },
      timeline: [
        { id: "0927-step-01", time: "05:35", title: "退房，确认大件行李已转送", detail: "只携带日包；520/600路仅作非早班备选。", type: "行李", place: "kenny" },
        { id: "0927-step-02", time: "06:10", title: "8号线 · 月坪 → 大坪", detail: "19.3 km，目标4.5–5小时，完成三章。", type: "徒步", place: "wolpyeong" },
        { id: "0927-step-03", time: "11:00", title: "大坪短休与身体评估", detail: "仅在11:15前完成且无明显疼痛、水泡恶化时继续。", type: "检查", place: "daepyeong" },
        { id: "0927-step-04", time: "11:30", title: "前往和顺金沙滩", detail: "打车约20–30分钟；12:30前必须开走10号线。", type: "打车", place: "hwasun" },
        { id: "0927-step-05", time: "12:30", title: "10号线前段 · 和顺 → Seotal Oreum", detail: "走约11.4 km，依次完成起点章和中间章。", type: "徒步", place: "hwasun" },
        { id: "0927-step-06", time: "16:10", title: "抵达10号线中间章", detail: "在停车场亭子盖章，到此停止，不继续赶终点。", type: "盖章", place: "seotal" },
        { id: "0927-step-07", time: "16:25", title: "中间章 → Amantov Pension", detail: "直接打车返回并取大件行李，约20–30分钟。", type: "打车", place: "amantov" }
      ],
      cutoff: "8号线11:15后结束、有明显疼痛，或12:30仍未从和顺出发，立即取消10号线前段。",
      fallback: "当天只完成8号线；9月28日取消加波岛，清晨完整走10号线，认证仍约102.1 km。",
      hotel: "amantov"
    },
    {
      id: "0928", date: "9月28日", weekday: "周一", label: "续10 + 10-1", walkKm: 8.4, routeIds: ["10-1"],
      stampPlan: [
        { routeId: "10", stamps: ["end"], note: "续走并盖终点章" },
        { routeId: "10-1", stamps: ["start", "end"], note: "额外路线，可取消 · 官方图仅两章" }
      ],
      lead: "先完成10号线达到102.1 km；加波岛可取消，返港后尽早办理证书。",
      next: { time: "06:30", title: "起床、早餐与整理行李", detail: "全部行李在07:00前整理完成。", mode: "准备", place: "amantov" },
      timeline: [
        { id: "0928-step-01", time: "06:30", title: "起床、早餐与整理行李", detail: "早餐从简，07:00准时退房。", type: "准备", place: "amantov" },
        { id: "0928-step-02", time: "07:00", title: "打车返回10号线中间章", detail: "携带全部行李，车程约20–30分钟。", type: "打车", place: "seotal" },
        { id: "0928-step-03", time: "07:25", title: "续走10号线 · Seotal → 摹瑟浦", detail: "剩余约4.2 km，目标1小时10分钟，抵达后盖终点章。", type: "徒步", place: "seotal" },
        { id: "0928-step-04", time: "08:35", title: "完成10号线，累计102.1 km", detail: "暂不等09:00领证，直接前往云津港。", type: "到达", place: "hamo" },
        { id: "0928-step-05", time: "08:45", title: "摹瑟浦 → 云津港", detail: "打车约5–10分钟，预留充足取票时间。", type: "打车", place: "unjin" },
        { id: "0928-step-06", time: "10:00", title: "乘船前往加波岛", detail: "返程时间以往返订单为准，优先12:20返港组合。", type: "船班", place: "gapado" },
        { id: "0928-step-07", time: "10:20", title: "10-1号线 · 加波岛", detail: "4.2 km，官方图标起点与终点两章；终点在加波治安中心，返码头需另留时间。", type: "徒步", place: "gapado" },
        { id: "0928-step-08", time: "12:20", title: "目标返船 · 先确认回港接驳", detail: "10-1终点不在上洞浦口；只有确认终点回港交通与返船时间后才安排此船，否则选较晚班。", type: "船班", place: "unjin" },
        { id: "0928-step-09", time: "13:00", title: "目标领取100 km证书", detail: "返港后携本人纸质护照办理；若晚船返港，顺延办理但须赶在16:30受理结束前。", type: "证书", place: "hamo" },
        { id: "0928-step-10", time: "13:35", title: "午餐或直接去机场", detail: "美荣家与提前去机场二选一；用餐则14:30后出发。", type: "选择", place: "miyeong" },
        { id: "0928-step-11", time: "14:30", title: "摹瑟浦 → 济州机场", detail: "搭明确途经机场的151系列班次；无合适班次则打车。", type: "公交", place: "airport" },
        { id: "0928-step-12", time: "16:00", title: "抵达济州机场", detail: "最晚不晚于19:30抵达，预留国际航班手续时间。", type: "航班", place: "airport" },
        { id: "0928-step-13", time: "22:40", title: "7C8133飞往北京首都", detail: "CJU → PEK T2，预计次日01:10抵达；以订单为准。", type: "航班" }
      ],
      cutoff: "09:00仍未完成10号线、或无法确认加波岛返港接驳与证书16:30前受理，则取消加波岛；返港延误先领证，跳过午餐。",
      fallback: "加波岛停航：完成10号线并领取证书后直接休整或前往机场。",
      hotel: null
    }
  ];

  const completionStampsByStep = {
    "0924-step-05": ["1-start", "1-middle", "1-end"],
    "0924-step-09": ["1-1-start", "1-1-middle", "1-1-end"],
    "0925-step-02": ["5-start", "5-middle", "5-end"],
    "0925-step-04": ["6-start", "6-middle", "6-end"],
    "0926-step-02": ["7-start", "7-middle", "7-end"],
    "0926-step-04": ["7-1-start", "7-1-middle", "7-1-end"],
    "0927-step-02": ["8-start", "8-middle", "8-end"],
    "0927-step-06": ["10-start", "10-middle"],
    "0928-step-04": ["10-end"],
    "0928-step-07": ["10-1-start", "10-1-end"]
  };

  const cutoffsByDay = {
    "0923": [
      { id: "0923-hotel", time: "23:30", title: "完成入住与补给", action: "若入境延误，先入住，取消当晚其他安排。" }
    ],
    "0924": [
      { id: "0924-leave-hotel", time: "08:05", title: "最晚离开酒店去始兴里", action: "超过即改打车，不再继续等公交。" },
      { id: "0924-route-1", time: "12:35", title: "必须完成1号线", action: "仍未完成则取消牛岛骑行，优先盖齐三章。" },
      { id: "0924-udo-return", time: "17:10", title: "回到牛岛码头", action: "立即还车并搭计划返船，18:00只作紧急备用。" }
    ],
    "0925": [
      { id: "0925-luggage", time: "05:45", title: "确认大件行李去向", action: "未确认转送或寄存时不要背大件行李开走。" },
      { id: "0925-finish", time: "15:30", title: "抵达旅行者中心", action: "中秋不依赖沿途营业点，必要时缩短休息。" }
    ],
    "0926": [
      { id: "0926-finish", time: "15:30", title: "回到旅行者中心", action: "若持续疼痛或水泡恶化，先从主路安全撤出。" }
    ],
    "0927": [
      { id: "0927-route-8", time: "11:15", title: "完成8号线并评估身体", action: "延误或明显疼痛时取消10号线前段。" },
      { id: "0927-route-10", time: "12:30", title: "必须从和顺开走", action: "仍未出发则取消10号线前段，次日完整走10号线。" }
    ],
    "0928": [
      { id: "0928-route-10", time: "09:00", title: "必须完成10号线", action: "仍未完成则取消加波岛，先确保100 km认证。" },
      { id: "0928-certificate", time: "16:30", title: "证书受理结束", action: "返港延误时先领证，跳过午餐与其他停留。" }
    ]
  };

  const cutoffStepIds = {
    "0923-hotel": "0923-step-04",
    "0924-leave-hotel": "0924-step-04",
    "0924-route-1": "0924-step-05",
    "0924-udo-return": "0924-step-10",
    "0925-luggage": "0925-step-01",
    "0925-finish": "0925-step-05",
    "0926-finish": "0926-step-05",
    "0927-route-8": "0927-step-02",
    "0927-route-10": "0927-step-05",
    "0928-route-10": "0928-step-04",
    "0928-certificate": "0928-step-09"
  };

  days.forEach(function (day) {
    day.timeline.forEach(function (item) {
      if (completionStampsByStep[item.id]) item.completionStamps = completionStampsByStep[item.id].slice();
    });
    day.cutoffs = (cutoffsByDay[day.id] || []).map(function (item) {
      return Object.assign({ resolveStepId: cutoffStepIds[item.id] }, item);
    });
  });

  // Resolve deadlines only from a relevant record, never from elapsed time or legacy execution state.
  const cutoffEvidence = {
    "0924-route-1": { completionStamps: ["1-start", "1-middle", "1-end"] },
    "0925-luggage": { confirmationIds: ["kenny-luggage"] },
    "0925-finish": { completionStamps: ["5-start", "5-middle", "5-end", "6-start", "6-middle", "6-end"] },
    "0926-finish": { completionStamps: ["7-start", "7-middle", "7-end", "7-1-start", "7-1-middle", "7-1-end"] },
    "0928-route-10": { completionStamps: ["10-start", "10-middle", "10-end"] }
  };
  days.forEach(function (day) { day.cutoffs.forEach(function (cutoff) { Object.assign(cutoff, cutoffEvidence[cutoff.id] || {}); }); });

  const confirmations = [
    { id: "playce-luggage", dayId: "0924", label: "Playce 07:45寄存已确认", hint: "联系酒店" },
    { id: "udo-ferry", dayId: "0924", label: "牛岛往返船班已复核", hint: "前一晚" },
    { id: "kenny-luggage", dayId: "0925", label: "大件行李转送Kenny已确认", hint: "不要背走" },
    { id: "amantov-luggage", dayId: "0927", label: "大件行李转送Amantov已确认", hint: "提前联系" },
    { id: "gapado-ticket", dayId: "0928", label: "加波岛10:00往返已预订", hint: "核对返程" },
    { id: "certificate-office", dayId: "0928", label: "证书服务点营业已复核", hint: "09:00–11:30 / 13:00–16:30" }
  ];

  const flights = [
    { direction: "去程", date: "9月23日", airline: "春秋航空", number: "9C7205", from: "PKX", to: "CJU", depart: "18:55", arrive: "21:35", note: "北京大兴 → 济州；当地时间" },
    { direction: "返程", date: "9月28日", airline: "济州航空", number: "7C8133", from: "CJU", to: "PEK T2", depart: "22:40", arrive: "次日01:10", note: "济州 → 北京首都T2；当地时间" }
  ];

  const categories = {
    all: { label: "全部", icon: "bookmark.svg" },
    food: { label: "美食", icon: "utensils.svg" },
    cafe: { label: "咖啡甜品", icon: "coffee.svg" },
    scenic: { label: "景点", icon: "camera.svg" },
    shopping: { label: "购物", icon: "shopping-bag.svg" },
    other: { label: "其他", icon: "bookmark.svg" }
  };

  window.TRIP_DATA = {
    trip: { plannedWalkKm: 106.3, coreCertificateKm: 102.1, plannedBikeKm: 13.2 },
    places,
    defaultCheckins,
    routes,
    stampLocations,
    routeGuides,
    days,
    confirmations,
    flights,
    categories
  };
})();
