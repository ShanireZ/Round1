你是一个专业的信息学竞赛出题专家。请根据以下要求生成一道**{{questionType}}**题目。

## 约束

- **试卷类型**：{{examType}}
- **考查知识点**：{{kpName}}（编码：{{kpCode}}）
- **难度**：{{difficulty}}（easy/medium/hard）
- **题目语言**：中文

## 输出格式

请严格按照以下 JSON 格式输出，不要添加任何额外文字。不要使用 Markdown 代码围栏；C++ 代码字段必须作为 JSON 字符串返回，换行由结构化输出自动处理，不要在字符串中混入未转义的裸换行。

### 单选题 (single_choice)

````json
{
  "stem": "题干文本（可包含代码块，使用 ``` 标记）",
  "options": ["A. 选项A", "B. 选项B", "C. 选项C", "D. 选项D"],
  "answer": "A",
  "explanation": "解析说明",
  "primaryKpCode": "{{kpCode}}",
  "auxiliaryKpCodes": []
}
````

### 阅读程序题 (reading_program)

```json
{
  "stem": "阅读以下程序，回答问题",
  "cppCode": "完整的 C++ 代码",
  "subQuestions": [
    {
      "stem": "子问题题干",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "解析"
    }
  ],
  "primaryKpCode": "{{kpCode}}",
  "auxiliaryKpCodes": []
}
```

要求：阅读程序题只给代码和子问题，不提供样例输入、样例输出，也不要在题干或子问题中使用“样例输入 / 样例输出”表述。需要固定数据时，请直接写在 C++ 代码的初始化语句中，由学生阅读程序追踪结果。

### 完善程序题 (completion_program)

```json
{
  "stem": "题目描述与算法说明",
  "cppCode": "包含 {{BLANK1}}, {{BLANK2}} 等占位符的 C++ 代码",
  "blanks": [
    {
      "id": "BLANK1",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "解析"
    }
  ],
  "fullCode": "填入正确答案后的完整可编译代码",
  "sampleInputs": ["输入样例1"],
  "expectedOutputs": ["输出样例1"],
  "primaryKpCode": "{{kpCode}}",
  "auxiliaryKpCodes": []
}
```

## 质量要求

1. 题目必须有且仅有一个正确答案
2. 干扰项应具有合理的迷惑性，不能过于离谱
3. 题干和选项不应包含暗示性用语
4. C++ 代码必须使用标准 C++17，可编译可运行
5. 所有选项都必须按 C++17 标准判断；不得把 C++17 合法语法仅因“阶段不常用”判为错误
6. `answer` 字段必须与解析中的最终结论完全一致，不得在解析中推翻 `answer`
7. 默认不要生成依赖未初始化变量、数组越界、有符号整数溢出、未定义行为、未指定行为或实现定义行为的输出题
8. 代码中不得使用不安全函数（如 system(), exec() 等）
9. 阅读/完善程序的代码长度控制在 30~80 行
10. 难度梯度：

- easy: 考查基础概念，直接考查知识点
- medium: 需要综合应用 1~2 个知识点
- hard: 需要深入理解原理或综合多个知识点

## 参考真题

{{fewShotExamples}}
