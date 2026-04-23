// js/core.js — 共用基礎模組
// Firebase globals (initialized in HTML before module loads)
// firebase and db are global variables

// === Constants ===
export const PARTS=["頭","上停","中停","下停","耳","眉","眼","鼻","口/法令"];
export const PARTS_SHORT=["頭","上","中","下","耳","眉","眼","鼻","口"];
export const PALETTE=[{bg:"#f0ebe5",tx:"#4a453e"},{bg:"#ece4db",tx:"#4a4138"},{bg:"#ebe6e0",tx:"#45403a"},{bg:"#f5efe6",tx:"#4d463d"},{bg:"#f2ece4",tx:"#4a433b"},{bg:"#e8e2d9",tx:"#403a31"},{bg:"#e5edf0",tx:"#3b4d54"},{bg:"#d9e5eb",tx:"#2d3a40"},{bg:"#cedde6",tx:"#253138"},{bg:"#e8f0e5",tx:"#3d4a3b"},{bg:"#dce8d9",tx:"#2e3a2c"},{bg:"#d1e0cc",tx:"#243122"},{bg:"#c6d8bf",tx:"#1d291b"}];
export const DIMS=[{cat:"先天指數",a:"形",b:"勢",aT:"靜",bT:"動",view:"格局",da:"形",db:"勢",dn:"形勢"},{cat:"先天指數",a:"經",b:"緯",aT:"靜",bT:"動",view:"核心價值",da:"經",db:"緯",dn:"經緯"},{cat:"先天指數",a:"圓",b:"方",aT:"動",bT:"靜",view:"成就",da:"方",db:"圓",dn:"方圓"},{cat:"先天指數",a:"直",b:"曲",aT:"靜",bT:"動",view:"責任",da:"曲",db:"直",dn:"曲直"},{cat:"先天指數",a:"收",b:"放",aT:"靜",bT:"動",view:"能耐",da:"收",db:"放",dn:"收放"},{cat:"先天指數",a:"緩",b:"急",aT:"靜",bT:"動",view:"成敗",da:"緩",db:"急",dn:"緩急"},{cat:"運氣指數",a:"順",b:"逆",aT:"靜",bT:"動",view:"天運天機",da:"順",db:"逆",dn:"順逆"},{cat:"運氣指數",a:"合",b:"分",aT:"靜",bT:"動",view:"地運資源",da:"分",db:"合",dn:"分合"},{cat:"運氣指數",a:"真",b:"假",aT:"靜",bT:"動",view:"人運人和",da:"真",db:"假",dn:"真假"},{cat:"後天指數",a:"攻",b:"守",aT:"動",bT:"靜",view:"戰略",da:"攻",db:"守",dn:"攻守"},{cat:"後天指數",a:"奇",b:"正",aT:"動",bT:"靜",view:"戰術",da:"奇",db:"正",dn:"奇正"},{cat:"後天指數",a:"實",b:"虛",aT:"靜",bT:"動",view:"算略",da:"虛",db:"實",dn:"虛實"},{cat:"後天指數",a:"進",b:"退",aT:"動",bT:"靜",view:"智略",da:"進",db:"退",dn:"進退"}];

/* ===== Observation Data ===== */
export const OBS_GROUPS=[
  {name:'頭 — 頂骨',items:[{id:'h01',label:'左頂骨龜背，緩緩向中間隆起'},{id:'h02',label:'右頂骨龜背，緩緩向中間隆起'},{id:'h04L',label:'左頂骨圓而不方'},{id:'h04R',label:'右頂骨圓而不方'},{id:'h03',label:'左右頂骨大小一致'}]},
  {name:'頭 — 枕骨',items:[{id:'h07',label:'枕骨圓（後腦為圓不為平）'},{id:'h08',label:'枕骨兩側一致，無傾斜'},{id:'h09',label:'枕骨有凹凸或自剋骨'},{id:'h05',label:'中線直前（百會穴→前方為直線）'},{id:'h06',label:'中線直後（百會穴→枕骨為直線）'}]},
  {name:'頭 — 華陽骨',items:[{id:'h10',label:'左華陽圓隆起，不尖平凹'},{id:'h11',label:'右華陽圓隆起，不尖平凹'},{id:'h13',label:'左華陽平直'},{id:'h14',label:'右華陽平直'},{id:'h12',label:'左右華陽大小一致'}]},
  {name:'上停（額）',items:[{id:'f01',label:'額有疵（有痕紋痣疤）'},{id:'f02',label:'額平寬（正面看平且寬）'},{id:'f03',label:'額無凹凸（無左低右傾）'},{id:'f04',label:'額隆（側面有隆起弧度）'},{id:'f05',label:'額立（側面偏直上非斜上）'},{id:'f06',label:'日月角隆（側看隆起）'},{id:'f07',label:'日月角開（正面看偏兩側）'}]},
  {name:'耳',paired:true,pairLabel:'耳',items:[{id:'ear_01',label:'耳長（耳尖端到耳垂長度超過眼到鼻準底的 2/3）'},{id:'ear_02',label:'耳高（耳上緣在眉眼之間、齊眉或以上）'},{id:'ear_03',label:'耳立（耳上端與耳垂中央一直線，接近垂直，無提耳）'},{id:'ear_04',label:'耳圓（上半部圓弧完整，上耳輪不往下翻，耳輪圓無凹陷或波浪）'},{id:'ear_05',label:'耳大'},{id:'ear_06',label:'耳厚（耳肉多）'},{id:'ear_07',label:'耳堅（耳肉不軟）'},{id:'ear_08',label:'輪廓（有輪有廓，輪廓分明）'},{id:'ear_09',label:'輪包廓（正面看耳廓不擋耳輪）'},{id:'ear_10',label:'有垂珠'}],sharedItem:{id:'e00',label:'左右耳高度、大小、耳型一致'}},
  {name:'眉 — 眉型',paired:true,pairLabel:'眉',items:[{id:'brow_01',label:'眉長過目'},{id:'brow_02',label:'眉彎（尾1/3有彎朝下）'},{id:'brow_03',label:'眉平（一條線，無彎）'},{id:'brow_04',label:'眉有鷹角（眉 2/3 處上緣有明顯轉折，類似三角形）'},{id:'brow_06',label:'眉有中斷'},{id:'brow_07',label:'印堂無眉毛（眉頭不蓋到印堂）'},{id:'brow_14',label:'眉頭延伸線不到山根（眉頭方向不朝山根延伸）'},{id:'brow_08',label:'眉尾有聚（收攏不散）'},{id:'brow_11',label:'眉長有揚（眉尾往上）'},{id:'brow_15',label:'眉短且濃（眉不過目且一小段濃短）'}]},
  {name:'眉 — 眉質',paired:true,pairLabel:'眉',items:[{id:'brow_05',label:'眉質勻（毛順，濃淡均勻，不粗不亂）'},{id:'brow_09',label:'眉身鋪陳有致（毛距相等，根根見肉）'},{id:'brow_16',label:'根根見肉（毛距可見皮膚）'}]},
  {name:'眉 — 眉位',paired:true,pairLabel:'眉',items:[{id:'brow_10',label:'眉附骨位（眉毛長在眉骨上）'},{id:'brow_12',label:'眉高居額（眉毛高過或在眉骨上方，位置高在額中）'},{id:'brow_13',label:'眉不壓眼（間距一指幅以上）'}],sharedItem:{id:'m00',label:'雙眉大小、高低一致'}},
  {name:'眼',paired:true,pairLabel:'眼',items:[{id:'eye_01a',label:'眼細長'},{id:'eye_01b',label:'眼大長'},{id:'eye_02',label:'眼平（眼尾不朝上或朝下）'},{id:'eye_03',label:'眼弧（眼型有弧度，上眼瞼不偏三角，下眼瞼稍有弧度）'},{id:'eye_04',label:'眼鉤（眼頭有鉤，前眥鉤曲如鳥嘴）'},{id:'eye_05',label:'刀裁（眼尾有刀裁，後眥如刀裁平整）'}],sharedItem:{id:'y00',label:'左右眼高度、大小、眼型一致'}},
  {name:'鼻',items:[{id:'n01',label:'鼻長（山根到鼻準，與鼻準到下巴接近或更長，與印堂到髮際線接近或更長）'},{id:'n02',label:'鼻高（鼻樑（年壽）要高）'},{id:'n03',label:'鼻直（山根到鼻準直線與面部中線重合）'},{id:'n04',label:'鼻肉多於骨'},{id:'n05',label:'鼻樑有明顯起節'}]},
  {name:'口 — 口型',items:[{id:'k01',label:'口大（開大合小）'},{id:'k02',label:'涯岸（唇邊界明顯，唇線清晰，唇有肉）'},{id:'k07',label:'唇厚均（上下唇差不多）'},{id:'k09',label:'閉合線為水平一字'},{id:'k08',label:'閉合線有曲度弧度'},{id:'k10',label:'口中線在臉中線上'},{id:'k11',label:'口左右一致（口無歪斜，左右無大小區別）'}]},
  {name:'口 — 嘴角',items:[{id:'k03',label:'嘴角有收'},{id:'k06',label:'嘴角朝上'},{id:'k05',label:'嘴角平（水平一字）'},{id:'k04',label:'嘴角朝下'}]},
  {name:'顴',paired:true,pairLabel:'顴',items:[{id:'zy_01',label:'顴高（靠近眼下緣）'},{id:'zy_02',label:'顴隆（顴骨視覺明顯且隆起有肉）'},{id:'zy_03',label:'顴肉多於骨'},{id:'zy_04',label:'顴鼻相稱（顴骨隆起幅度與鼻相稱：鼻低顴低或鼻高顴高）'}]},
  {name:'人中',items:[{id:'r01',label:'人中深（人中溝深，如剖竹狀）'},{id:'r02',label:'人中長（人中夠長，至少食指寬）'},{id:'r03',label:'人中直（人中到承漿連線垂直，與面部中線重合，且切分之左右唇大小相等）'}]},
  {name:'地閣',items:[{id:'g01',label:'地閣起（豐滿有起，承漿凹）'},{id:'g02',label:'地閣平（下巴骨平，無凹凸）'},{id:'g03',label:'地閣圓（下巴骨圓）'},{id:'g04',label:'地閣寬（至少與口同寬）'}]},
  {name:'頤',paired:true,pairLabel:'頤',items:[{id:'jaw_01',label:'頤豐（頤骨豐隆有肉）'},{id:'jaw_02',label:'頤削'},{id:'jaw_03',label:'頤圓（頤骨有弧度，有肉）'},{id:'jaw_04',label:'頤平直（頤骨平直，不隆不凹不尖削）'}],sharedItem:{id:'i00',label:'左右頤大小一致'}}
];

// 測試版模式：只顯示前 N 個維度（6=先天, 9=+運氣, 13=全部）
// 網址加 ?dev=1 可看全部（開發用），正常網址依此數字控制
export const BETA_VISIBLE_DIMS=13;

export function initBetaUI() {
  // 舊版 nav-manual-sens 已被 v2 取代，不再自動顯示
}

export const OBS_PARTS=[{name:'頭',groups:[0,1,2]},{name:'上停（額）',groups:[3]},{name:'耳',groups:[4]},{name:'眉',groups:[5,6,7]},{name:'眼',groups:[8]},{name:'鼻',groups:[9]},{name:'口',groups:[10,11]},{name:'顴骨',groups:[12]},{name:'人中',groups:[13]},{name:'地閣',groups:[14]},{name:'頤',groups:[15]}];

export const OBS_PARTS_DATA_DEFAULT = {
'頭':{total:15,sections:[{label:'頂骨',qs:[{id:'h1',text:'頂骨型相',paired:true,opts:[{v:'龜背',hint:'無凹凸，緩緩向中間隆起'},{v:'圓',hint:'往下側偏圓弧'},{v:'平寬',hint:'往外側平展才向下'}]},{id:'h2',text:'頂骨中央接合',opts:[{v:'突起',hint:''},{v:'平順',hint:''},{v:'凹陷',hint:''}]},{id:'h3',text:'頂骨左右一致性',opts:[{v:'左右一致',hint:'大小、高低、凹凸、坡度一致'},{v:'左右不一致',hint:''}]},{id:'h4',text:'頂骨中線',opts:[{v:'中線直',hint:'百會穴為起點，矢狀縫中線向前為直線到髮際中央'},{v:'中線斜歪',hint:''}]}]},{label:'枕骨',qs:[{id:'h5',text:'枕骨型相',opts:[{v:'後腦圓',hint:''},{v:'後腦平',hint:''}]},{id:'h6',text:'枕骨凹凸',opts:[{v:'順無凹凸',hint:''},{v:'有凹凸',hint:''}]},{id:'h7',text:'枕骨自剋骨',opts:[{v:'有自剋骨',hint:'後端有圓或尖突起'},{v:'無自剋骨',hint:''}]},{id:'h8',text:'枕骨橫條骨',opts:[{v:'有橫條骨',hint:'有明顯橫向骨突起'},{v:'無橫條骨',hint:''}]},{id:'h9',text:'枕骨中線',opts:[{v:'中線直',hint:'百會穴為起點到枕骨下緣中點為直線'},{v:'中線歪',hint:''}]},{id:'h10',text:'枕骨左右一致性',opts:[{v:'兩側一致',hint:''},{v:'兩側不一致',hint:''}]}]},{label:'華陽骨',qs:[{id:'h11',text:'華陽骨型相',paired:true,opts:[{v:'圓隆',hint:'圓隆起'},{v:'平直',hint:'不隆不凹'},{v:'突露',hint:'有明顯突起骨'},{v:'凹陷',hint:''}]},{id:'h12',text:'華陽骨銜接',paired:true,opts:[{v:'順接',hint:'與頂骨間無太大轉折起伏，順著銜接'},{v:'有轉折起伏',hint:''}]},{id:'h13',text:'華陽骨左右一致性',opts:[{v:'左右一致',hint:'大小、高低等一致'},{v:'左右不一致',hint:''}]}]},{label:'頭骨整體',qs:[{id:'h14',text:'頭骨寬窄',opts:[{v:'頭窄',hint:'百會穴到枕骨下端長度 ≥ 兩側華陽骨上緣間距'},{v:'頭寬',hint:'百會穴到枕骨下端長度 < 兩側華陽骨上緣間距'}]},{id:'h15',text:'頭骨硬度',opts:[{v:'偏硬',hint:'按壓骨感明顯，肉偏少'},{v:'一般',hint:''}]}]}]},
'額':{total:17,sections:[{label:'額型',qs:[{id:'e1',text:'額高低',opts:[{v:'額高',hint:'眉到髮際長度佔臉 1/3 或以上'},{v:'額低',hint:''}]},{id:'e2',text:'額圓方',opts:[{v:'額圓',hint:'形狀偏橢圓'},{v:'額方',hint:'類似橫躺長方形'}]},{id:'e3',text:'額寬窄',opts:[{v:'額寬',hint:'兩側寬闊'},{v:'額窄',hint:''}]},{id:'e4',text:'額平整',opts:[{v:'額平',hint:'正面看無凹凸、高低不平'},{v:'額不平',hint:''}]},{id:'e5',text:'額乾淨',opts:[{v:'額淨',hint:'無痕紋痣疤疵陷'},{v:'額有缺陷',hint:''}]},{id:'e6',text:'額隆起',opts:[{v:'額隆',hint:'側面看有隆起弧度'},{v:'額均',hint:'側面較平'},{v:'額陷',hint:''}]},{id:'e7',text:'額立斜',opts:[{v:'額立',hint:'側面偏直上'},{v:'額斜',hint:'側面斜上'}]},{id:'e8',text:'額長方',opts:[{v:'額長',hint:'兩眼角距離小於眉到髮際距離'},{v:'額方',hint:'兩眼角距離約等於眉到髮際距離'}]},{id:'e9',text:'額順折',opts:[{v:'額順',hint:'眉骨與額頭銜接處無明顯凹槽'},{v:'額折',hint:'銜接處有明顯凹槽'}]},{id:'e10',text:'額鬆緊',opts:[{v:'額緊',hint:'額骨感明顯、硬度高、無皺紋'},{v:'額鬆',hint:''}]},{id:'e11',text:'大小天庭',opts:[{v:'大天庭',hint:'額頭整體隆起'},{v:'小天庭',hint:'額頭中間區域較隆起，兩側不特別寬'},{v:'無',hint:'整體偏平'}]}]},{label:'髮際線',qs:[{id:'e12',text:'美人尖',opts:[{v:'有美人尖',hint:'髮際中央有向下突出'},{v:'無美人尖',hint:''}]}]},{label:'額內部位',qs:[{id:'e13',text:'日月角隆',opts:[{v:'日月角起',hint:'上方髮際兩側下方有明顯隆起'},{v:'不清晰',hint:''}]},{id:'e14',text:'日月角開合',opts:[{v:'日月角開',hint:'兩側偏外，靠近邊城方向'},{v:'日月角合',hint:'較靠近中線'}]},{id:'e15',text:'日月角骨肉',opts:[{v:'有肉包',hint:'肉感為主，骨不凸'},{v:'骨感明顯',hint:'骨較突出'}]},{id:'e16',text:'輔角骨',opts:[{v:'有輔角骨',hint:'眉尾上方外側到髮際線有隆起'},{v:'不明顯',hint:''}]},{id:'e17',text:'佐串骨',opts:[{v:'有佐串骨',hint:'接近髮際角落轉折處有隆起'},{v:'不明顯',hint:''}]}]}]},
'耳':{total:15,sections:[{label:'耳形',qs:[{id:'er1',text:'耳長短',paired:true,opts:[{v:'耳長',hint:'長度超過眼到鼻準底的 2/3'},{v:'耳短',hint:'長度不及眼到鼻準底的 2/3'}]},{id:'er2',text:'耳大小',paired:true,opts:[{v:'耳大',hint:''},{v:'耳適中',hint:''},{v:'耳小',hint:''}]},{id:'er3',text:'耳立提',paired:true,opts:[{v:'耳立',hint:'耳上端與耳垂中央一直線，接近垂直'},{v:'耳提',hint:'朝前傾，不垂直'},{v:'耳提強',hint:'朝前約 30 度以上'}]},{id:'er4',text:'耳圓缺',paired:true,opts:[{v:'耳圓',hint:'圓弧完整，耳輪無凹陷波浪，上耳輪不往內翻'},{v:'耳尖',hint:'上耳輪形尖起'},{v:'耳缺',hint:'開花／內翻／方形有角等'}]},{id:'er5',text:'耳貼程度',paired:true,opts:[{v:'貼耳',hint:'夾角偏小，幾乎貼頭顱'},{v:'一般',hint:''},{v:'招風耳',hint:'夾角 > 40 度，正面超出臉廓'}]},{id:'er6',text:'耳孔',paired:true,opts:[{v:'耳孔大',hint:'盆地範圍 ≥ 耳面積 1/2'},{v:'耳孔小',hint:''}]}]},{label:'耳位置',qs:[{id:'er7',text:'耳高低',paired:true,opts:[{v:'耳高',hint:'上緣在眉眼之間或齊眉以上'},{v:'耳低',hint:'上緣低於眼'}]}]},{label:'輪廓',qs:[{id:'er8',text:'輪廓有無',paired:true,opts:[{v:'有輪有廓',hint:'輪廓分明'},{v:'有輪無廓',hint:''},{v:'無輪有廓',hint:''}]},{id:'er9',text:'輪包廓',paired:true,opts:[{v:'輪包廓',hint:'耳廓不擋耳輪'},{v:'輪不包廓',hint:'耳廓外露擋輪'}]}]},{label:'耳質',qs:[{id:'er10',text:'耳厚薄',paired:true,opts:[{v:'耳厚',hint:'耳肉多'},{v:'耳正常',hint:''},{v:'耳薄',hint:'薄如紙'}]},{id:'er11',text:'耳質硬軟',paired:true,opts:[{v:'耳堅',hint:'有硬度不軟'},{v:'耳硬',hint:'中段偏硬'},{v:'耳軟',hint:''}]}]},{label:'垂珠',qs:[{id:'er12',text:'垂珠',paired:true,opts:[{v:'有垂珠',hint:'耳垂大小明顯，且耳垂上有凸起耳珠'},{v:'無垂珠',hint:''}]},{id:'er13',text:'耳垂方向',paired:true,opts:[{v:'耳垂朝口',hint:''},{v:'耳垂朝下',hint:''},{v:'其他',hint:''}]}]},{label:'一致性',qs:[{id:'er14',text:'雙耳一致性',opts:[{v:'雙耳一致',hint:'大小、形狀、高低一致'},{v:'雙耳不一致',hint:''}]}]},{label:'耳勢',qs:[{id:'er15',text:'耳勢',paired:true,opts:[{v:'耳勢朝上',hint:'整體耳型朝上長'},{v:'一般',hint:''}]}]}]},
'眉':{total:20,sections:[{label:'眉型',qs:[{id:'br1',text:'眉長短',paired:true,opts:[{v:'眉長',hint:'眉長過目'},{v:'眉短',hint:'眉短不及目'}]},{id:'br2',text:'眉粗細',paired:true,opts:[{v:'眉形細',hint:''},{v:'眉型適中',hint:''},{v:'眉型粗',hint:''}]},{id:'br3',text:'眉形走向',paired:true,opts:[{v:'眉彎',hint:'尾 1/3 處有彎朝下'},{v:'眉平',hint:'眉形呈一條線，無彎'}]},{id:'br4',text:'鷹角',paired:true,opts:[{v:'有鷹角',hint:'眉 2/3 處上緣有明顯轉折'},{v:'無鷹角',hint:''}]},{id:'br5',text:'眉毛中斷',paired:true,opts:[{v:'無中斷',hint:''},{v:'有中斷',hint:'有空隙'}]},{id:'br6',text:'眉尾',paired:true,opts:[{v:'有聚',hint:'眉尾收攏不散'},{v:'散',hint:'眉尾散開'}]},{id:'br7',text:'特殊眉型',paired:true,opts:[{v:'短粗眉',hint:'眉型粗且短濃'},{v:'將軍眉',hint:'眉尾大幅飛揚朝斜上'},{v:'無',hint:''}]}]},{label:'眉勢',qs:[{id:'br8',text:'眉尾方向',paired:true,opts:[{v:'有揚',hint:'眉尾往上'},{v:'平',hint:''},{v:'往下',hint:''}]},{id:'br9',text:'眉頭與山根',paired:true,opts:[{v:'不沖根',hint:'眉頭方向不朝山根延伸'},{v:'沖根',hint:''}]},{id:'br10',text:'眉的位置高低',paired:true,opts:[{v:'眉高居額',hint:'眉位置高在額中'},{v:'一般',hint:''}]}]},{label:'眉位',qs:[{id:'br11',text:'眉眼間距',paired:true,opts:[{v:'不壓眼',hint:'眉眼間距一指幅以上'},{v:'壓眼',hint:'間距不足一指幅'}]},{id:'br12',text:'眉頭位置',paired:true,opts:[{v:'退印',hint:'眉頭不蓋到印堂'},{v:'蓋印堂',hint:''}]},{id:'br13',text:'眉附骨位',paired:true,opts:[{v:'貼附眉骨',hint:'眉毛長在眉骨上'},{v:'不貼附',hint:''}]},{id:'br14',text:'眉毛順亂',paired:true,opts:[{v:'眉順',hint:'毛向一致，不逆生'},{v:'眉亂',hint:'有逆生或雜亂'}]}]},{label:'眉質',qs:[{id:'br15',text:'眉毛硬軟',paired:true,opts:[{v:'柔順',hint:''},{v:'質硬',hint:'粗硬不柔順'}]},{id:'br16',text:'眉毛量',paired:true,opts:[{v:'眉毛多',hint:'量足'},{v:'眉毛稀少',hint:'稀疏或無眉'}]},{id:'br17',text:'眉身鋪陳',paired:true,opts:[{v:'鋪陳有致',hint:'毛距相等，根根見肉'},{v:'一般',hint:''},{v:'有交叉',hint:'疏密不均'}]},{id:'br18',text:'眉毛單根長度',paired:true,opts:[{v:'毛不過短',hint:''},{v:'眉毛短',hint:'毛短，不長，蓋不住'}]},{id:'br19',text:'眉頭與印堂',paired:true,opts:[{v:'不沖印',hint:'眉頭不延伸到印堂'},{v:'沖印',hint:'眉頭蓋到印堂'}]}]},{label:'一致性',qs:[{id:'br20',text:'雙眉一致性',opts:[{v:'雙眉一致',hint:'大小、高低一致'},{v:'雙眉不一致',hint:''}]}]}]},
'眼':{total:12,sections:[{label:'眼型',qs:[{id:'ey1',text:'眼長短',paired:true,opts:[{v:'眼長',hint:'眼長度 ≥ 眼距，或極寸約 3.3 公分'},{v:'眼短',hint:'眼長度 < 眼距'}]},{id:'ey2',text:'眼大小',paired:true,opts:[{v:'眼大',hint:'眼寬可見 80% 以上黑睛'},{v:'眼小',hint:''}]},{id:'ey3',text:'眼細圓',paired:true,opts:[{v:'眼細',hint:'眼長 > 2 倍眼寬'},{v:'眼圓',hint:''}]},{id:'ey4',text:'眼尾方向',paired:true,opts:[{v:'眼尾平',hint:''},{v:'眼尾朝上',hint:''},{v:'眼尾朝下',hint:''}]},{id:'ey5',text:'睛凸',paired:true,opts:[{v:'睛凸',hint:'眼球較突出眼瞼'},{v:'正常',hint:''}]}]},{label:'眼輪廓',qs:[{id:'ey6',text:'眼鉤',paired:true,opts:[{v:'有眼鉤',hint:'眼頭有鉤，前眥鉤曲如鳥嘴'},{v:'無眼鉤',hint:''}]},{id:'ey7',text:'刀裁',paired:true,opts:[{v:'有刀裁',hint:'眼尾如刀裁收緊，後眥平整'},{v:'無刀裁',hint:''}]},{id:'ey8',text:'上眼瞼',paired:true,opts:[{v:'眼上弧',hint:'上眼瞼有弧度'},{v:'有較硬轉角',hint:'偏三角兩邊感'}]},{id:'ey9',text:'下眼瞼',paired:true,opts:[{v:'下眼瞼平直',hint:''},{v:'下眼瞼有弧',hint:''}]}]},{label:'睛瞳',qs:[{id:'ey10',text:'黑睛大小',paired:true,opts:[{v:'睛大',hint:''},{v:'適中',hint:'約眼長 1/3–1/2'},{v:'睛小',hint:''}]},{id:'ey11',text:'眼白',paired:true,opts:[{v:'上下不白',hint:'黑睛遮住上下眼白'},{v:'上三白',hint:'黑睛下移，上方露白'},{v:'下三白',hint:'黑睛上移，下方露白'},{v:'四白',hint:'黑睛居中，上下皆露白'}]}]},{label:'一致性',qs:[{id:'ey12',text:'雙眼一致性',opts:[{v:'雙眼一致',hint:'大小、形狀、高低一致'},{v:'雙眼不一致',hint:''}]}]}]},
'鼻':{total:12,sections:[{label:'鼻型',qs:[{id:'n1',text:'鼻長短',opts:[{v:'鼻長',hint:'山根到鼻準，與鼻準到下巴接近或更長，與印堂到髮際線接近或更長'},{v:'鼻短',hint:''}]},{id:'n2',text:'鼻高低',opts:[{v:'鼻高',hint:'鼻樑年壽夠突起'},{v:'鼻低',hint:''}]},{id:'n3',text:'鼻直曲',opts:[{v:'鼻直',hint:'山根到鼻準與中線重合'},{v:'鼻曲',hint:''}]},{id:'n4',text:'鼻寬窄',opts:[{v:'鼻寬',hint:''},{v:'鼻窄小',hint:'鼻翼寬度小於眼距'}]},{id:'n5',text:'鼻準形',opts:[{v:'鼻準圓',hint:'不尖，形圓有肉'},{v:'鼻準尖',hint:''}]},{id:'n6',text:'鼻順',opts:[{v:'鼻順',hint:'山根年壽鼻準側面順接，不折不凹凸'},{v:'鼻不順',hint:''}]},{id:'n7',text:'鼻接印',opts:[{v:'鼻接印',hint:'山根隆起上接印堂、下接年壽'},{v:'鼻不接印',hint:''}]},{id:'n8',text:'鼻橫張',opts:[{v:'有橫張',hint:'年壽寬度接近鼻翼寬度'},{v:'無橫張',hint:''}]},{id:'n9',text:'山根寬窄',opts:[{v:'山根寬',hint:''},{v:'山根窄',hint:'明顯短於鼻樑鼻準'}]}]},{label:'鼻骨肉',qs:[{id:'n10',text:'鼻骨肉比',opts:[{v:'肉多於骨',hint:''},{v:'骨肉勻稱',hint:''},{v:'骨多於肉',hint:'骨感強'}]},{id:'n11',text:'鼻起節',opts:[{v:'無起節',hint:''},{v:'有起節突露',hint:''}]},{id:'n12',text:'鼻聚散',opts:[{v:'鼻聚',hint:'準頭聚，跟鼻樑寬度差不多'},{v:'鼻散',hint:''}]}]}]},
'顴':{total:6,sections:[{label:'顴形',qs:[{id:'q1',text:'顴骨形態',paired:true,opts:[{v:'顴高且隆',hint:'位置在眼和鼻準間，有明顯隆起感'},{v:'顴有而不明',hint:'稍看得出，摸得到凸起'},{v:'顴平',hint:'無明顯隆起'}]},{id:'q2',text:'顴骨大小',paired:true,opts:[{v:'顴大',hint:''},{v:'顴不過大',hint:''},{v:'顴小尖',hint:''}]}]},{label:'顴骨肉',qs:[{id:'q3',text:'顴骨肉比',paired:true,opts:[{v:'顴有肉',hint:'肉多於骨，感覺有肉包起'},{v:'顴無肉少肉',hint:'骨感明顯堅硬，或小塊突起'}]}]},{label:'顴柄',qs:[{id:'q4',text:'顴柄走向',paired:true,opts:[{v:'顴柄插天',hint:'明顯，尾端朝上往太陽穴方向延伸'},{v:'顴柄平',hint:'隱約不明顯，平不起不凹'},{v:'無明顯顴柄',hint:''}]}]},{label:'顴整體',qs:[{id:'q5',text:'顴鼻相稱',opts:[{v:'相稱',hint:'顴高鼻高，或顴低鼻低'},{v:'不相稱',hint:''}]},{id:'q6',text:'雙顴一致性',opts:[{v:'雙顴一致',hint:''},{v:'雙顴不一致',hint:''}]}]}]},
'口':{total:13,sections:[{label:'口型',qs:[{id:'m1',text:'口大小',opts:[{v:'口開大合小',hint:'合起大於鼻翼/眼頭，開時超過瞳孔'},{v:'口適中',hint:'口寬過鼻翼，寬度在兩瞳孔距離之內'},{v:'口小',hint:'合起約等於或小於鼻翼'}]},{id:'m2',text:'涯岸',opts:[{v:'涯岸分明',hint:'唇邊界明顯，唇線清晰'},{v:'唇緣較不明顯',hint:''}]},{id:'m3',text:'嘴角收斂',opts:[{v:'嘴角收',hint:'嘴角明顯有收緊'},{v:'嘴角不收',hint:''}]},{id:'m4',text:'嘴角方向',opts:[{v:'嘴角朝上',hint:''},{v:'嘴角水平',hint:''},{v:'嘴角朝下',hint:''}]},{id:'m5',text:'上唇V形',opts:[{v:'水星明顯',hint:'上嘴唇與人中間的 V 形明顯'},{v:'水星不明顯',hint:''}]},{id:'m6',text:'閉合線',opts:[{v:'閉合線平',hint:'口闔時接合線水平'},{v:'閉合線有曲度',hint:'有弓線'}]},{id:'m7',text:'口閉緊',opts:[{v:'閉合線密',hint:'雙唇放鬆緊密，無明顯間隙'},{v:'閉合線較鬆',hint:''},{v:'放鬆見齒',hint:''}]}]},{label:'唇型',qs:[{id:'m8',text:'唇厚度',opts:[{v:'唇一般',hint:''},{v:'唇明顯厚',hint:''},{v:'唇薄',hint:''}]},{id:'m9',text:'唇厚均',opts:[{v:'唇厚平均',hint:'上下唇厚度差不多，上唇可略厚於下唇'},{v:'唇厚不均',hint:''}]},{id:'m10',text:'唇起',opts:[{v:'唇凸',hint:'嘴唇往外突出或翹起明顯'},{v:'唇不凸',hint:''}]},{id:'m11',text:'唇垂珠',opts:[{v:'有唇珠',hint:'上嘴唇與人中間有小顆突起'},{v:'無唇珠',hint:''}]}]},{label:'一致性',qs:[{id:'m12',text:'口中線',opts:[{v:'口位置適中',hint:'口中線在臉的中線上'},{v:'口位置不中',hint:''}]},{id:'m13',text:'口對稱',opts:[{v:'口對稱',hint:'口不歪斜，左右對稱'},{v:'口不對稱',hint:''}]}]}]},
'人中':{total:4,sections:[{label:'人中',qs:[{id:'p1',text:'人中深淺',opts:[{v:'人中深',hint:'溝深，如剖竹狀'},{v:'人中淺',hint:'溝淺或無明顯溝'}]},{id:'p2',text:'人中長短',opts:[{v:'人中長',hint:'至少食指寬'},{v:'人中短',hint:'短於食指寬'}]},{id:'p3',text:'人中寬窄',opts:[{v:'人中寬度適中',hint:''},{v:'人中窄',hint:''}]},{id:'p4',text:'人中方向',opts:[{v:'人中直',hint:'人中到口連線垂直不歪'},{v:'人中不直',hint:''}]}]}]},
'地閣':{total:6,sections:[{label:'地閣型',qs:[{id:'c1',text:'地閣朝',opts:[{v:'地閣起',hint:'承漿凹，朝拱，凸起適中'},{v:'地閣凸',hint:'下巴尖端超過嘴唇垂直線'},{v:'地閣縮',hint:'側面下巴尖端短於嘴唇垂直線'}]},{id:'c2',text:'地閣平',opts:[{v:'地閣平',hint:'無凹凸'},{v:'地閣圓',hint:'下巴骨圓'},{v:'地閣凹',hint:'中間有凹如 W 型'}]}]},{label:'地閣大小',qs:[{id:'c3',text:'地閣長短',opts:[{v:'地閣長',hint:'長過鼻準到下巴的 1/3'},{v:'地閣適中',hint:''},{v:'地閣短',hint:'短於鼻準到下巴的 1/3'}]},{id:'c4',text:'地閣寬窄',opts:[{v:'地閣寬',hint:'約等口寬或更寬'},{v:'地閣窄尖',hint:'寬度等於或小於鼻翼'}]}]},{label:'地閣位置',qs:[{id:'c5',text:'地閣位置',opts:[{v:'地閣置中',hint:'地閣中線與臉部中線重合'},{v:'地閣歪',hint:''}]}]},{label:'地閣骨肉',qs:[{id:'c6',text:'地閣骨肉',opts:[{v:'地閣有肉',hint:'肉包起不露骨'},{v:'地閣無肉',hint:'骨感明顯'}]}]}]},
'頤':{total:4,sections:[{label:'頤',qs:[{id:'y1',text:'頤角度',paired:true,opts:[{v:'頤寬',hint:'耳下到下巴連線角度大，腮角明顯'},{v:'頤平',hint:'角度適中'},{v:'頤削',hint:'角度小，趨近垂直線'}]},{id:'y2',text:'頤肉量',paired:true,opts:[{v:'頤豐',hint:'頤骨豐隆有肉，弧度飽滿'},{v:'頤有肉',hint:'有肉但不過豐'},{v:'頤露尖',hint:'肉少或尖，視覺上薄'}]},{id:'y3',text:'頤長短',paired:true,opts:[{v:'頤長度正常',hint:''},{v:'頤短',hint:''}]},{id:'y4',text:'雙頤一致性',opts:[{v:'雙頤一致',hint:''},{v:'雙頤不一致',hint:''}]}]}]}
};

export let OBS_PARTS_DATA = JSON.parse(JSON.stringify(OBS_PARTS_DATA_DEFAULT));
export let _questionsSource = '內建';
export const OBS_PART_NAMES_DEFAULT=['頭','額','耳','眉','眼','鼻','顴','口','人中','地閣','頤'];
export let OBS_PART_NAMES = [...OBS_PART_NAMES_DEFAULT];
export const OBS_PART_PREFIX={頭:'h',額:'e',耳:'er',眉:'br',眼:'ey',鼻:'n',顴:'q',口:'m',人中:'p',地閣:'c',頤:'y'};

export const FACE_MAP_PARTS=[
  {name:'頭',obsIdx:0,col:'1/4',row:'1/2'},
  {name:'額',obsIdx:1,col:'1/4',row:'2/3'},
  {name:'耳',obsIdx:2,col:'1/2',row:'3/6'},
  {name:'眉',obsIdx:3,col:'2/3',row:'3/4'},
  {name:'眼',obsIdx:4,col:'2/3',row:'4/5'},
  {name:'顴',obsIdx:6,col:'2/3',row:'5/6'},
  {name:'鼻',obsIdx:5,col:'2/3',row:'6/7'},
  {name:'耳2',obsIdx:2,col:'3/4',row:'3/6'},
  {name:'頤',obsIdx:10,col:'1/2',row:'7/10'},
  {name:'人中',obsIdx:8,col:'2/3',row:'7/8'},
  {name:'口',obsIdx:7,col:'2/3',row:'8/9'},
  {name:'地閣',obsIdx:9,col:'2/3',row:'9/10'},
  {name:'頤2',obsIdx:10,col:'3/4',row:'7/10'}
];

// === Observation state ===
export let obsData={}, obsOverride={}, curObsPart=0;

export function gv(id,side){if(!side)return !!obsData[id];const k=side+'_'+id;return k in obsOverride?!!obsOverride[k]:!!obsData[id];}

// === Mutable state variables ===
export let DIM_RULES = [];
export let _rulesSource = '內建';
export const PART_LABELS = ['頭','上停','中停','下停','耳','眉','眼','鼻','口','顴','人中','地閣','頤'];
export const PART_ORDER = [0,1,4,5,6,7,8,2,9,3,10,11,12];
export const emptyData = () => Array(13).fill(null).map(() => Array(9).fill(null));
export let cur = 0;
export let data = emptyData();
export let _basisVars = {};
export let condResults = {};
export let userName = '';
export let _isTA = false;
export let currentUser = null;
export let userRole = 'student';
export let _currentCaseId = null;
export let _currentCaseName = '';
export let _userGender = '';
export let _userBirthday = '';
export let _caseGender = '';
export let _caseBirthday = '';
export let _caseDate = '';
export let _liunianTable = null;
export let manualData = null;

// === Setter functions (for cross-module mutation of let exports) ===
export function setCur(v) { cur = v; }
export function setData(v) { data = v; }
export function setCondResults(v) { condResults = v; }
export function setUserName(v) { userName = v; }
export function setIsTA(v) { _isTA = v; }
export function setCurrentUser(v) { currentUser = v; }
export function setUserRole(v) { userRole = v; }
export function setCurrentCaseId(v) { _currentCaseId = v; }
export function setCurrentCaseName(v) { _currentCaseName = v; }
export function setUserGender(v) { _userGender = v; }
export function setUserBirthday(v) { _userBirthday = v; }
export function setCaseGender(v) { _caseGender = v; }
export function setCaseBirthday(v) { _caseBirthday = v; }
export function setCaseDate(v) { _caseDate = v; }
export function setLiunianTable(v) { _liunianTable = v; }
export function setManualData(v) { manualData = v; }
export function setDimRules(v) { DIM_RULES = v; }
export function setRulesSource(v) { _rulesSource = v; }
export function setObsData(v) { obsData = v; }
export function setObsOverride(v) { obsOverride = v; }
export function setCurObsPart(v) { curObsPart = v; }
export function setObsPartsData(v) { OBS_PARTS_DATA = v; }
export function setObsPartNames(v) { OBS_PART_NAMES = v; }
export function setQuestionsSource(v) { _questionsSource = v; }
export function setBasisVars(v) { _basisVars = v; }

// === Utility functions ===

export function calcDim(dataArr, i) {
  const r = dataArr[i], a = r.filter(v => v === 'A').length, b = r.filter(v => v === 'B').length;
  if (a + b === 0) return null;
  return { a, b, coeff: Math.min(a, b) / Math.max(a, b), type: a > b ? DIMS[i].aT : DIMS[i].bT };
}

export function avgCoeff(dataArr, ids) {
  var sumMin = 0, sumMax = 0;
  ids.forEach(function(i) { var r = calcDim(dataArr, i); if (r) { sumMin += Math.min(r.a, r.b); sumMax += Math.max(r.a, r.b); } });
  return sumMax > 0 ? (sumMin / sumMax).toFixed(2) : "0.00";
}

export function _getUserDocRef() {
  if (!currentUser) return null;
  const uid = currentUser.uid;
  if (userRole === 'admin' && _currentCaseId) {
    return db.collection('users').doc(uid).collection('cases').doc(_currentCaseId);
  }
  return db.collection('users').doc(uid);
}

let _saveTimer = null;
export function save() {
  if (!currentUser) return;
  localStorage.setItem('obs_data_v1', JSON.stringify(obsData));
  localStorage.setItem('obs_override_v1', JSON.stringify(obsOverride));
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    _getUserDocRef().set({ dataJson: JSON.stringify(data), obsJson: JSON.stringify(obsData), overrideJson: JSON.stringify(obsOverride), updatedAt: new Date().toISOString() }, { merge: true }).catch(function(e) { console.log('雲端儲存失敗', e); });
  }, 1500);
}

export function _showToast(msg) {
  var t = document.getElementById('toast-notify'); if (!t) return;
  t.textContent = msg; t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, 2000);
}

export function _escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

export function setNavActive(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-dropdown-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-dropdown-btn').forEach(t => t.classList.remove('has-active'));
  if (tab) {
    var el = document.getElementById(tab);
    if (el) {
      el.classList.add('active');
      var dd = el.closest('.nav-dropdown');
      if (dd) { var btn = dd.querySelector('.nav-dropdown-btn'); if (btn) btn.classList.add('has-active'); }
    }
  }
}

const ALL_PAGES = ['entry-page','mode-page','app-body','report-overlay',
  'knowledge-overlay','cond-page','sens-page','manual-page',
  'case-page','manual-sens-page','manual-sens-v2-page'];

export function showPage(pageId) {
  ALL_PAGES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('top-nav').style.display = 'flex';
  if (pageId) {
    const el = document.getElementById(pageId);
    if (el) el.style.display = (pageId === 'app-body' ? 'grid' : (pageId === 'mode-page' || pageId === 'knowledge-overlay' || pageId === 'cond-page' ? 'flex' : 'block'));
  }
}
