#!/usr/bin/env python3
"""規則引擎 vs 舊邏輯對照測試 — Python 版"""
import json

# === Rule Engine (Python port of rule_engine.js) ===

def get_answer(ref, side, obs):
    if side:
        k = f'{ref}_{side}'
        if k in obs: return obs[k]
        return obs.get(ref, '')
    return obs.get(ref, '')

def evaluate(node, obs, side=None, pr=None):
    if pr is None: pr = {}
    if not node: return False

    # Leaf: match
    if 'ref' in node:
        eff_side = node.get('side', side) if 'side' not in node else node['side']
        answer = get_answer(node['ref'], eff_side, obs)
        m = node['match']
        if isinstance(m, list):
            return answer in m
        return answer == m

    # partResult
    if 'partResult' in node:
        p = node['partResult']
        if '.' in p:
            part_name, sub = p.split('.', 1)
            pd = pr.get(part_name, {})
            return pd.get(sub, False)
        pd = pr.get(p, {})
        return pd.get('result') == 'positive'

    # Inline rule (no veto)
    if 'rule' in node and 'veto' not in node:
        return evaluate(node['rule'], obs, side, pr)

    # VETO + rule
    if 'veto' in node:
        for v in node['veto']:
            if evaluate(v['condition'], obs, side, pr):
                return v['result'] == 'positive'
        if 'rule' in node:
            return evaluate(node['rule'], obs, side, pr)
        return False

    op = node.get('op')
    items = node.get('items', [])

    if op == 'AND':
        return all(evaluate(it, obs, side, pr) for it in items)
    if op == 'OR':
        return any(evaluate(it, obs, side, pr) for it in items)
    if op == 'COUNT':
        c = sum(1 for it in items if evaluate(it, obs, side, pr))
        return c >= node['min']
    if op == 'LR':
        lr = evaluate(node['each'], obs, 'L', pr)
        rr = evaluate(node['each'], obs, 'R', pr)
        evaluate._last_lr = {'L': lr, 'R': rr}
        return (lr or rr) if node['merge'] == 'any' else (lr and rr)

    return False

evaluate._last_lr = None

def evaluate_part(part_def, obs, pr):
    if not part_def or 'rule' not in part_def:
        return {'result': 'negative'}
    if 'veto' in part_def:
        for v in part_def['veto']:
            if evaluate(v['condition'], obs, None, pr):
                return {'result': v['result']}
    evaluate._last_lr = None
    result = evaluate(part_def['rule'], obs, None, pr)
    out = {'result': 'positive' if result else 'negative'}
    if evaluate._last_lr:
        out['L'] = evaluate._last_lr['L']
        out['R'] = evaluate._last_lr['R']
    return out

def evaluate_dimension(dim_def, obs):
    part_order = ['頭','上停','耳','眉','眼','鼻','口','中停','下停']
    pr = {}
    for pn in part_order:
        pd = dim_def['parts'].get(pn)
        pr[pn] = evaluate_part(pd, obs, pr) if pd else {'result': 'negative'}

    pos = sum(1 for pn in part_order if pr[pn]['result'] == 'positive')
    neg = sum(1 for pn in part_order if pr[pn]['result'] == 'negative')
    attr = dim_def['positiveType'] if pos > neg else dim_def['negativeType']
    coeff = min(pos, neg) / max(pos, neg) if max(pos, neg) > 0 else 0
    return {'results': pr, 'positiveCount': pos, 'negativeCount': neg, 'attribute': attr, 'coefficient': coeff}


# === Load dim rule ===
with open('rules/dim_09_攻守.json', 'r') as f:
    dim_def = json.load(f)

passes = 0
fails = 0

def run(name, desc, obs, part_name, expected):
    global passes, fails
    result = evaluate_dimension(dim_def, obs)
    actual = 'A' if result['results'][part_name]['result'] == 'positive' else 'B'
    ok = actual == expected
    if ok: passes += 1
    else: fails += 1
    print(f'[{name}] {desc}')
    print(f'  預期: {part_name} = {"攻" if expected=="A" else "守"}({expected})')
    print(f'  實際: {"攻" if actual=="A" else "守"}({actual})')
    print(f'  結果: {"PASS" if ok else "FAIL"}')
    if not ok:
        print(f'  DEBUG: {result["results"][part_name]}')
    print()

# ===== 頭 =====
run('10-0-A','頭攻（頭硬）',{'h15':'偏硬'},'頭','A')
run('10-0-B','頭守（5條皆無）',{'h15':'一般','h2':'平順','h7':'無自剋骨','h8':'無橫條骨','h11_L':'圓隆','h11_R':'圓隆'},'頭','B')
run('10-0-C','頭攻（左華陽突露）',{'h11_L':'突露'},'頭','A')
run('10-0-D','頭攻（有自剋骨）',{'h7':'有自剋骨'},'頭','A')
run('10-0-E','頭攻（有橫條骨）',{'h8':'有橫條骨'},'頭','A')
run('10-0-F','頭攻（頂骨突起）',{'h2':'突起'},'頭','A')

# ===== 上停 =====
run('10-1-A','上停攻（美人尖）',{'e12':'有美人尖'},'上停','A')
run('10-1-B','上停攻（額緊）',{'e10':'額緊'},'上停','A')
run('10-1-C','上停攻（骨感+大天庭）',{'e15':'骨感明顯','e11':'大天庭'},'上停','A')
run('10-1-D','上停攻（骨感+小天庭）',{'e15':'骨感明顯','e11':'小天庭'},'上停','A')
run('10-1-E','上停守（3條皆無）',{'e12':'無美人尖','e10':'額鬆','e15':'有肉包','e11':'無'},'上停','B')
run('10-1-F','上停守（骨感但無天庭）',{'e15':'骨感明顯','e11':'無'},'上停','B')

# ===== 耳 =====
run('10-4-A','耳攻（左耳高）',{'er7_L':'耳高'},'耳','A')
run('10-4-B','耳攻（右耳尖）',{'er4_R':'耳尖'},'耳','A')
run('10-4-C','耳攻（右耳硬）',{'er11_R':'耳硬'},'耳','A')
run('10-4-D','耳攻（左輪不包廓）',{'er9_L':'輪不包廓'},'耳','A')
run('10-4-E','耳攻（右耳勢朝上）',{'er15_R':'耳勢朝上'},'耳','A')
run('10-4-F','耳守（左右皆安全）',
    {'er7_L':'耳低','er7_R':'耳低','er9_L':'輪包廓','er9_R':'輪包廓',
     'er4_L':'耳圓','er4_R':'耳圓','er11_L':'耳軟','er11_R':'耳軟',
     'er15_L':'一般','er15_R':'一般'},'耳','B')

# ===== 眉 =====
run('10-5-A','眉攻（左眉3/4）',{'br4_L':'有鷹角','br16_L':'眉毛稀少','br15_L':'質硬','br8_L':'平'},'眉','A')
run('10-5-B','眉守（左2/4 右1/4）',
    {'br4_L':'有鷹角','br8_L':'有揚','br16_L':'眉毛多','br15_L':'柔順',
     'br4_R':'有鷹角','br8_R':'平','br16_R':'眉毛多','br15_R':'柔順'},'眉','B')
run('10-5-C','眉攻（右眉4/4）',{'br4_R':'有鷹角','br16_R':'眉毛稀少','br15_R':'質硬','br8_R':'有揚'},'眉','A')

# ===== 眼 =====
run('10-6-A','眼攻（左眼鉤）',{'ey6_L':'有眼鉤'},'眼','A')
run('10-6-B','眼攻（右眼大圓尾上）',{'ey2_R':'眼大','ey3_R':'眼圓','ey4_R':'眼尾朝上'},'眼','A')
run('10-6-C','眼攻（左眼凸）',{'ey5_L':'睛凸'},'眼','A')
run('10-6-D','眼守（無攻條件）',{'ey6_L':'無眼鉤','ey6_R':'無眼鉤','ey5_L':'正常','ey5_R':'正常'},'眼','B')
run('10-6-E','眼守（大圓但尾不朝上）',{'ey2_R':'眼大','ey3_R':'眼圓','ey4_R':'眼尾平'},'眼','B')

# ===== 鼻 =====
run('10-7-A','鼻攻（鼻高）',{'n2':'鼻高'},'鼻','A')
run('10-7-B','鼻攻（有起節）',{'n11':'有起節突露'},'鼻','A')
run('10-7-C','鼻攻（骨多於肉）',{'n10':'骨多於肉'},'鼻','A')
run('10-7-D','鼻攻（山根窄）',{'n9':'山根窄'},'鼻','A')
run('10-7-E','鼻守（4條皆無）',{'n2':'鼻低','n11':'無起節','n10':'肉多於骨','n9':'山根寬'},'鼻','B')

# ===== 口 =====
run('10-8-A','口攻（嘴角朝上）',{'m4':'嘴角朝上'},'口','A')
run('10-8-B','口攻（唇薄）',{'m8':'唇薄'},'口','A')
run('10-8-C','口攻（放鬆見齒）',{'m7':'放鬆見齒'},'口','A')
run('10-8-D','口攻（唇凸）',{'m10':'唇凸'},'口','A')
run('10-8-E','口攻（有唇珠）',{'m11':'有唇珠'},'口','A')
run('10-8-F','口守（5條皆無）',{'m4':'嘴角水平','m7':'閉合線密','m8':'唇一般','m10':'唇不凸','m11':'無唇珠'},'口','B')

# ===== 中停 =====
run('10-2-A','中停攻（4部位：左眉+左眼+鼻+左顴）',
    {'br4_L':'有鷹角','br16_L':'眉毛稀少','br15_L':'質硬',
     'ey6_L':'有眼鉤','n2':'鼻高','q1_L':'顴高且隆'},'中停','A')
run('10-2-B','中停守（3部位）',
    {'br4_L':'有鷹角','br16_L':'眉毛稀少','br15_L':'質硬',
     'ey6_L':'有眼鉤','n2':'鼻高'},'中停','B')

# ===== 下停 =====
run('10-3-A','下停攻（口攻+人中窄+地閣短=3/5）',
    {'m4':'嘴角朝上','p3':'人中窄','c3':'地閣短'},'下停','A')
run('10-3-B','下停守（只有口攻=1/5）',{'m4':'嘴角朝上'},'下停','B')

# ===== 整維度 =====
print('--- 整維度計算 ---')

def run_dim(name, desc, obs, expected_attr):
    global passes, fails
    result = evaluate_dimension(dim_def, obs)
    ok = expected_attr is None or result['attribute'] == expected_attr
    if ok: passes += 1
    else: fails += 1
    parts = ['頭','上停','中停','下停','耳','眉','眼','鼻','口']
    ps = ' '.join(f'{p}={"攻" if result["results"][p]["result"]=="positive" else "守"}' for p in parts)
    print(f'[{name}] {desc}')
    print(f'  {ps}')
    print(f'  攻{result["positiveCount"]} 守{result["negativeCount"]} → {result["attribute"]} {result["coefficient"]:.2f}')
    if expected_attr: print(f'  預期: {expected_attr} → {"PASS" if ok else "FAIL"}')
    print()

run_dim('DIM-A','全攻',
    {'h15':'偏硬','e12':'有美人尖','er7_L':'耳高',
     'br4_L':'有鷹角','br16_L':'眉毛稀少','br15_L':'質硬',
     'ey6_L':'有眼鉤','n2':'鼻高','m4':'嘴角朝上',
     'q1_L':'顴高且隆','p3':'人中窄','c3':'地閣短','y2_L':'頤露尖'},'動')

run_dim('DIM-B','全守',
    {'h15':'一般','h2':'平順','e12':'無美人尖','e10':'額鬆',
     'er7_L':'耳低','er7_R':'耳低','er9_L':'輪包廓','er9_R':'輪包廓',
     'n2':'鼻低','n11':'無起節','n10':'肉多於骨','n9':'山根寬',
     'm4':'嘴角水平','m7':'閉合線密','m8':'唇一般'},'靜')

run_dim('DIM-C','空obsData',{},None)

# ===== Summary =====
print('='*40)
print(f'Total: {passes+fails} cases, {passes} PASS, {fails} FAIL')
if fails > 0: exit(1)
